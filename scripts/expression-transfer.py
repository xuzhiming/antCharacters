"""Agent-selected lip/brow correspondence; reusable geometry, no facial detector.

All selections belong to the current Studio's original mesh. Drivers are disposable;
only owned shape keys are written. Distances are relative to the selected feature.
"""
import heapq
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

LIBRARY = Path(__file__).resolve().parent.parent/'assets/expression-authoring/feature-poses.json'


def library():
    return json.loads(LIBRARY.read_text(encoding='utf8'))


def frame(studio):
    return studio.mask_helper().axes(studio)


def mesh_info(studio, name):
    """Return geometry and original IDs, without assigning anatomical meaning."""
    obj = bpy.data.objects[name]; helper = studio.mask_helper()
    points = helper.basis_world(obj)
    parts = helper.components(obj.data)
    return dict(object=name, points=points.tolist(), frame_points=(points@frame(studio).T).tolist(),
                components=parts, boundaries=[helper.boundaries(obj.data, p) for p in parts],
                edges=[list(e.vertices) for e in obj.data.edges])


def selected_part(studio, name, seed):
    obj = bpy.data.objects[name]
    found = next((p for p in studio.mask_helper().components(obj.data) if seed in p), None)
    if found is None:
        raise ValueError('Selected component does not exist: '+name)
    return obj, found


def boundary_paths(studio, name, skin_seed, corners, upper, lower):
    """Trace two rim arcs through explicitly chosen upper/lower points.

    Loose boundary tails are ignored by path search, never deleted from the mesh.
    No inference from average height (a curled lip makes that unreliable).
    """
    obj, skin = selected_part(studio, name, skin_seed); region = set(skin)
    counts = {}
    for p in obj.data.polygons:
        if all(i in region for i in p.vertices):
            for edge in p.edge_keys:
                e = tuple(sorted(edge)); counts[e] = counts.get(e, 0)+1
    adj = {}
    for (a, b), count in counts.items():
        if count == 1:
            adj.setdefault(a, set()).add(b); adj.setdefault(b, set()).add(a)
    def path(a, b, excluded):
        queue = [a]; prev = {a: None}
        for i in queue:
            if i == b:
                result = [b]
                while prev[result[-1]] is not None: result.append(prev[result[-1]])
                return result[::-1]
            for j in sorted(adj.get(i, [])):
                if j not in prev and j not in excluded: prev[j] = i; queue.append(j)
        raise ValueError('The chosen points do not form a boundary arc. Inspect the real mouth opening in solid/wire views.')
    result = []
    for mid, other in [(upper, lower), (lower, upper)]:
        first = path(corners[0], mid, {other, corners[1]})
        result.append(first+path(mid, corners[1], {other, *first[:-1]})[1:])
    return dict(upper=result[0], lower=result[1])


def prepare_mouth(studio, object_name, skin_seed, upper, lower, support=2.85, protected=None):
    studio.audit()
    obj, skin = selected_part(studio, object_name, skin_seed)
    upper, lower = list(upper), list(lower)
    if min(len(upper), len(lower)) < 3 or upper[0] != lower[0] or upper[-1] != lower[-1]:
        raise ValueError('Ordered upper/lower arcs must share both corners.')
    if set(upper[1:-1]) & set(lower[1:-1]) or any(i not in skin for i in upper+lower):
        raise ValueError('Upper and lower arcs must be distinct paths in the selected skin.')
    edges = {tuple(sorted(e.vertices)) for e in obj.data.edges}
    if any(tuple(sorted(pair)) not in edges for arc in [upper, lower] for pair in zip(arc, arc[1:])):
        raise ValueError('Lip arcs must follow existing edges.')
    points = studio.mask_helper().basis_world(obj)@frame(studio).T
    if points[upper[0], 0] > points[upper[-1], 0]:
        upper.reverse(); lower.reverse()
    width = float(np.linalg.norm(points[upper[-1]]-points[upper[0]]))
    if width < 1e-8 or not .2 <= support <= 10:
        raise ValueError('Inspect the mouth width / relative influence radius.')
    protected = list(protected or [])
    if any(i not in skin for i in protected) or set(protected)&set(upper+lower):
        raise ValueError('Protected vertices must be skin outside the lip rim.')
    studio.state['mouth'] = dict(object=object_name, skin_seed=skin_seed, upper=upper, lower=lower,
                                 support=support, protected=protected, width=width, status='fit_needs_review')
    studio.record('mouth_arcs_selected', object=object_name, upper=upper, lower=lower)
    return studio.state['mouth']


def arc_parameter(points):
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    if d[-1] < 1e-12: raise ValueError('Collapsed lip arc.')
    return d/d[-1]


def capture_mouth_fit(studio, angles=None):
    config = studio.state['mouth']; obj = bpy.data.objects[config['object']]
    points = studio.mask_helper().basis_world(obj); objects = []; colors = [(1,.12,.2,1),(.1,.45,1,1)]
    try:
        for side, color in zip(['upper','lower'], colors):
            curve = bpy.data.curves.new('EA_LipArc', 'CURVE'); curve.dimensions = '3D'; curve.bevel_depth = config['width']*.012
            spline = curve.splines.new('POLY'); spline.points.add(len(config[side])-1)
            for p, i in zip(spline.points, config[side]): p.co = (*points[i],1)
            overlay = bpy.data.objects.new('EA_LipArc', curve); bpy.context.scene.collection.objects.link(overlay); overlay.color = color; objects.append(overlay)
        shot = studio.capture('aa',0,display='fit',label='mouth-fit-red-upper-blue-lower',angles=angles or ['Front','Oblique45'])
        config['fit_capture'] = shot; studio.record('mouth_fit_capture')
        return shot
    finally:
        for obj in objects:
            curve = obj.data; bpy.data.objects.remove(obj,do_unlink=True); bpy.data.curves.remove(curve)


def smooth_displacements(points, edges, skin, constraints, radius, protected=()):
    """Connected biharmonic displacement, leaving the neutral sculpt intact.

    Matrix-free conjugate gradient avoids a dense matrix for high resolution faces.
    The weights and graph distances use original geometry, in world units.
    """
    ids = np.array(skin, dtype=int); index = {v: i for i, v in enumerate(ids)}
    adjacency = [[] for _ in ids]; pairs = []
    for a, b in edges:
        if a in index and b in index:
            i, j = index[a], index[b]; d = float(np.linalg.norm(points[a]-points[b]))
            adjacency[i].append((j, d)); adjacency[j].append((i, d)); pairs.extend([(i, j, d), (j, i, d)])
    distance = np.full(len(ids), np.inf); queue = []
    for v in constraints: distance[index[v]] = 0; heapq.heappush(queue, (0, index[v]))
    while queue:
        d, i = heapq.heappop(queue)
        if d != distance[i] or d > radius: continue
        for j, length in adjacency[i]:
            nd = d+length
            if nd < distance[j]: distance[j] = nd; heapq.heappush(queue, (nd, j))
    a = np.array([p[0] for p in pairs]); b = np.array([p[1] for p in pairs])
    w = 1/np.maximum([p[2] for p in pairs], radius*1e-6)
    totals = np.bincount(a, weights=w, minlength=len(ids)); w /= totals[a]
    fixed = (distance > radius)
    for v in set(constraints)|set(protected): fixed[index[v]] = True
    free = np.flatnonzero(~fixed)
    count = next(iter(constraints.values())).shape[-1]
    pinned = np.zeros((len(ids), count))
    for v, d in constraints.items(): pinned[index[v]] = d
    def lap(x, transpose=False):
        out = x.copy()
        np.add.at(out, b if transpose else a, -w[:, None]*x[a if transpose else b])
        return out
    rhs = -lap(lap(pinned), True)[free]
    def multiply(x):
        all_x = np.zeros_like(pinned); all_x[free] = x
        return lap(lap(all_x), True)[free]+x*1e-8
    # Dense solve is fast on the small connected patch, CG on larger inputs.
    if len(free) <= 700:
        rows = np.unique(np.r_[free, a[np.isin(b, free)]])
        row_index = np.full(len(ids), -1); row_index[rows] = np.arange(len(rows))
        col_index = np.full(len(ids), -1); col_index[free] = np.arange(len(free))
        A = np.zeros((len(rows), len(free)))
        A[row_index[free], np.arange(len(free))] = 1
        selected = (row_index[a] >= 0) & (col_index[b] >= 0)
        np.add.at(A, (row_index[a[selected]], col_index[b[selected]]), -w[selected])
        solution = np.linalg.solve(A.T@A+np.eye(len(free))*1e-8, rhs)
    else:
        solution = np.zeros_like(rhs); residual = rhs.copy(); direction = residual.copy()
        rr = np.sum(residual*residual, axis=0); initial = rr.copy()
        for _ in range(min(6000, len(free)*3)):
            product = multiply(direction); alpha = rr/np.maximum(np.sum(direction*product, axis=0), 1e-30)
            solution += direction*alpha; residual -= product*alpha
            updated = np.sum(residual*residual, axis=0)
            if np.all(updated <= np.maximum(initial*1e-12, 1e-24)): break
            direction = residual+direction*(updated/np.maximum(rr, 1e-30)); rr = updated
        else: raise ValueError('Skin relaxation did not converge. Reduce the influence area or inspect disconnected / degenerate edges.')
    pinned[free] = solution
    result = np.zeros((len(points), count)); result[ids] = pinned
    return result


def write_delta(studio, obj, expression, world_delta):
    studio.include_object(obj); studio.ensure_expression(expression)
    key = obj.data.shape_keys.key_blocks[studio.state['keys'][expression][obj.name]]
    basis = np.array([v.co for v in obj.data.shape_keys.key_blocks[0].data])
    coords = basis+world_delta@np.array(obj.matrix_world.inverted().to_3x3()).T
    if not np.isfinite(coords).all(): raise ValueError('Non-finite deformation; original mesh retained.')
    for v, co in zip(key.data, coords): v.co = co
    obj.data.update()


def transfer_mouth(studio, expressions=None, reviewed=False):
    if not reviewed: raise ValueError('Review the two lip arcs from front and oblique, then use reviewed=True.')
    studio.audit(); config = studio.state['mouth']; donor = library()['mouth']
    obj, skin = selected_part(studio, config['object'], config['skin_seed'])
    points = studio.mask_helper().basis_world(obj); axes = frame(studio); target = points@axes.T
    names = list(expressions or donor['poses']); scale = config['width']/donor['width']
    constraints = {}
    for side in ['upper', 'lower']:
        src = np.array(donor[side]); dst = config[side]; values = []
        for name in names:
            delta = np.array(donor['poses'][name][side])-src
            values.append(np.array([np.interp(arc_parameter(target[dst]), arc_parameter(src), delta[:, j]) for j in range(3)]).T*scale)
        for i, v in zip(dst, np.concatenate(values, axis=1)): constraints[i] = v
    delta = smooth_displacements(target, [e.vertices[:] for e in obj.data.edges], skin, constraints,
                                 config['width']*config['support'], config['protected'])
    for n, name in enumerate(names): write_delta(studio, obj, name, delta[:, n*3:n*3+3]@axes)
    config.update(status='baked', expressions=names); studio.expression(names[0], 0)
    studio.record('mouth_transferred', expressions=names, support_widths=config['support'])
    return names


def centerline(p, u):
    knots = np.linspace(0, 1, 9)
    values = np.array([np.median(p[np.argsort(abs(u-a))[:max(3,len(p)//9)], 1:], axis=0) for a in knots])
    return lambda x: np.array([np.interp(x, knots, values[:, i]) for i in range(2)]).T


def prepare_brows(studio, selections, skin=None, protected=None, support=.8, full=.36):
    """selections = {L:{object,seed}, R:{object,seed}}. L/R are model sides.

    Optional skin follows the actual brow displacement. Protected eye vertices
    keep their position and smoothly fade nearby movement over .15 brow widths.
    """
    studio.audit()
    if set(selections) != {'L', 'R'}: raise ValueError('Specify the two observed brow components as L and R.')
    for selection in selections.values(): selected_part(studio, selection['object'], selection['seed'])
    if skin:
        _, part = selected_part(studio, skin['object'], skin['seed'])
        if not protected or any(i not in part for i in protected):
            raise ValueError('When following skin, explicitly select protected eye-rim vertices from that skin.')
    if not 0 <= full < support <= 5: raise ValueError('Use 0 <= full < support <= 5 brow widths.')
    studio.state['brows'] = dict(selections=selections, skin=skin, protected=list(protected or []), support=support, full=full, status='fit_needs_review')
    studio.record('brows_selected', selections=selections)
    return studio.state['brows']


def transfer_brows(studio, expressions=None, reviewed=False):
    if not reviewed: raise ValueError('Review the selected brows and protected eyes first; then use reviewed=True.')
    studio.audit(); config = studio.state['brows']; donor = library()['brows']; axes = frame(studio)
    names = list(expressions or donor['poses']); rest = []; posed = {n:[] for n in names}; faces = []; recipients = []; widths = []
    for side in ['L', 'R']:
        selection = config['selections'][side]; obj, ids = selected_part(studio, selection['object'], selection['seed'])
        source = np.array(donor[side]['neutral']); target = studio.mask_helper().basis_world(obj)[ids]@axes.T
        width = np.ptp(target[:, 0]); sw = np.ptp(source[:, 0])
        if width < 1e-8: raise ValueError('Brow width is zero in the chosen face frame.')
        widths.append(width); scale = width/sw
        su = (source[:, 0]-source[:, 0].min())/sw; tu = (target[:, 0]-target[:, 0].min())/width
        fit = source.copy(); fit[:, 0] = target[:, 0].min()+su*width
        fit[:, 1:] = (source[:, 1:]-centerline(source, su)(su))*scale+centerline(target, tu)(su)
        faces.extend([[i+len(rest) for i in p] for p in donor[side]['faces']]); rest.extend((fit@axes).tolist())
        for name in names: posed[name].extend(((fit+(np.array(donor['poses'][name][side])-source)*scale)@axes).tolist())
        recipients.append((obj, ids, target@axes))
    mesh = bpy.data.meshes.new('EA_BrowDriver'); mesh.from_pydata(rest, [], faces); mesh.update(); mesh.calc_loop_triangles()
    tris = [list(t.vertices) for t in mesh.loop_triangles]; mesh.clear_geometry(); mesh.from_pydata(rest, [], tris); mesh.update()
    driver = bpy.data.objects.new('EA_BrowDriver', mesh); bpy.context.scene.collection.objects.link(driver); driver.shape_key_add(name='Basis')
    for name in names:
        key = driver.shape_key_add(name=name)
        for v, p in zip(key.data, posed[name]): v.co = p
    points = np.concatenate([r[2] for r in recipients]); pm = bpy.data.meshes.new('EA_BrowSample'); pm.from_pydata(points.tolist(), [], [])
    sample = bpy.data.objects.new('EA_BrowSample', pm); bpy.context.scene.collection.objects.link(sample)
    mod = sample.modifiers.new('EA_BrowTransfer', 'SURFACE_DEFORM'); mod.target = driver
    active = bpy.context.view_layer.objects.active; bpy.context.view_layer.objects.active = sample
    def evaluate(name=None):
        for k in driver.data.shape_keys.key_blocks: k.value = float(k.name == name)
        driver.data.shape_keys.update_tag(); driver.update_tag(refresh={'DATA'}); sample.update_tag(refresh={'DATA'}); bpy.context.view_layer.update()
        return np.array([v.co.copy() for v in sample.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices])
    try:
        evaluate(); bpy.ops.object.surfacedeform_bind(modifier=mod.name)
        if not mod.is_bound: raise ValueError('Could not bind the fitted brow driver.')
        neutral = evaluate(); results = {name:evaluate(name)-neutral for name in names}
        if np.max(abs(evaluate()-points)) > np.mean(widths)*1e-5: raise ValueError('Brow neutral changed during binding.')
    finally:
        bpy.data.objects.remove(sample, do_unlink=True); bpy.data.meshes.remove(pm)
        bpy.data.objects.remove(driver, do_unlink=True); bpy.data.meshes.remove(mesh)
        bpy.context.view_layer.objects.active = active
    width = float(np.mean(widths))
    for name, displacement in results.items():
        changes = {}; start = 0
        for obj, ids, _ in recipients:
            delta = changes.setdefault(obj.name, np.zeros((len(obj.data.vertices), 3)))
            delta[ids] = displacement[start:start+len(ids)]; start += len(ids)
        if config['skin']:
            obj, ids = selected_part(studio, config['skin']['object'], config['skin']['seed'])
            xyz = studio.mask_helper().basis_world(obj)
            distances = np.linalg.norm(xyz[ids,None,:]-points[None,:,:], axis=2)
            near = np.argsort(distances, axis=1)[:,:min(6,len(points))]
            weight = 1/np.maximum(np.take_along_axis(distances, near, axis=1), width*.01)**2; weight /= weight.sum(1)[:,None]
            follow = (displacement[near]*weight[:,:,None]).sum(1)
            def smooth(x): x=np.clip(x,0,1); return x*x*(3-2*x)
            fade = 1-smooth((distances.min(1)/width-config['full'])/(config['support']-config['full']))
            eye_distance = np.linalg.norm(xyz[ids,None,:]-xyz[config['protected']][None,:,:], axis=2).min(1)
            fade *= smooth(eye_distance/(width*.15))
            changes.setdefault(obj.name, np.zeros_like(xyz))[ids] += follow*fade[:,None]
        for name_obj, delta in changes.items(): write_delta(studio, bpy.data.objects[name_obj], name, delta)
    config.update(status='baked', expressions=names); studio.expression(names[0],0); studio.record('brows_transferred', expressions=names)
    return names
