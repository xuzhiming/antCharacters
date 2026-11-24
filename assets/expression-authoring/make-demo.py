"""Small project-authored curved skin + detached lash fixture. No user model data."""
import bpy,math,sys,random
from pathlib import Path
from mathutils import Euler,Vector

args=sys.argv[sys.argv.index('--')+1:];dest=Path(args[0]);variant=len(args)>1 and args[1]=='variant'
bpy.ops.wm.read_factory_settings(use_empty=True)
vertices=[];faces=[];nx,nz=25,25
for j in range(nz):
 for i in range(nx):
  x=(i/(nx-1)-.5)*.8;z=.1+j/(nz-1)*.8;y=-.23+.35*x*x+.10*(z-.5)**2
  vertices.append((x,y,z))
for j in range(nz-1):
 for i in range(nx-1):
  a=j*nx+i;faces.append((a,a+1,a+1+nx,a+nx))
# A detached ribbon belongs to the same object and must stay outside connected falloff.
start=len(vertices)
for j in range(3):
 for i in range(9):vertices.append((-.22+i*.025,-.237,.51+j*.006))
for j in range(2):
 for i in range(8):
  a=start+j*9+i;faces.append((a,a+1,a+10,a+9))
if variant:
 order=list(range(len(vertices)));random.Random(581).shuffle(order);mapping={old:new for new,old in enumerate(order)};vertices=[vertices[i] for i in order];faces=[tuple(mapping[i] for i in face) for face in faces]
mesh=bpy.data.meshes.new('FixtureMesh');mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new('FixtureHead',mesh);bpy.context.collection.objects.link(obj)
uv=mesh.uv_layers.new(name='UVMap')
for face in mesh.polygons:
 for loop in face.loop_indices:
  p=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(p.x+.5,p.z)
mat=bpy.data.materials.new('OriginalChecker');mat.use_nodes=True;tex=mat.node_tree.nodes.new('ShaderNodeTexImage');image=bpy.data.images.new('FixtureColors',width=2,height=2);image.pixels=[.9,.4,.5,1, .9,.7,.7,1, .2,.1,.2,1, 1,.8,.8,1];image.pack();tex.image=image;shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);mesh.materials.append(mat)
obj.shape_key_add(name='Basis');keep=obj.shape_key_add(name='UserExisting');keep.data[0].co.z+=.0001
second=bpy.data.materials.new('OriginalSecond');second.diffuse_color=(.2,.5,.7,1);mesh.materials.append(second)
override=bpy.data.materials.new('OriginalObjectOverride');override.diffuse_color=(.7,.4,.2,1);obj.material_slots[1].link='OBJECT';obj.material_slots[1].material=override
for face in mesh.polygons:face.material_index=face.index%2
if variant:obj.rotation_euler=Euler((.21,-.32,.42));obj.scale=(.73,)*3;obj.location=(.34,-.18,.27)
sun=bpy.data.lights.new('FixtureLight','SUN');sun.energy=2;light=bpy.data.objects.new('FixtureLight',sun);bpy.context.collection.objects.link(light);light.rotation_euler=(.4,.1,.3)
bpy.context.view_layer.objects.active=obj;obj.select_set(True);dest.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(dest))
