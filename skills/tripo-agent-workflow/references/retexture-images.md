# Part retexture references

These are front and back images that give a paint job matching the actual mesh of each texture group. Save them separately from the initial head and body multiviews. Do not reuse the spring parts' mesh separation as part boundaries for image generation.

## Five texture categories

| ID | Scope |
| --- | --- |
| `hair` | All hair. Independent of the hair-strand spring classification. Omit in designs with no hair |
| `head` | The head, including the face and ears. Does not include hair |
| `upper_body` | Neck, torso, arms and hands, and the outfit covering them |
| `lower_body` | Outfits below the waist such as skirts and trousers, the legs, and footwear. Also includes small waist ornaments |
| `accessories` | Sets that make sense to treat on their own, such as bags, weapons and large ribbons. Omit if there are none |

Head, upper body and lower body are required. Do not create empty groups or invented equipment for hair or accessories that do not exist. Small ornaments and fasteners stay with the outfit they belong to. Large ribbons attached to the outfit are judged as accessories not only by how they are attached but by their size and their coherence in the design. Do not split further by skin/outfit or legs/shoes; keep the original outfit, exposed areas and colors.

From each group, export **a merged FBX with the same composition and front and back guides**, and make reference images of the same scope. For example, the skirt, legs and shoes are one lower-body FBX, clothed front and back images, and one 4K texture. Do not paint separate images of legs with the clothes removed or of legs up to the crotch. Do not remove the outfit or draw in new structure just to show the parts hidden by the skirt.

Keep the original separate components, return the returned UVs and materials to each component, and only then assemble the spring parts into separate meshes. Merging the lower body is an export unit for texture work; it is not an operation that welds the vertices of the skirt and the legs.

If a single connected component crosses the waist boundary, do not cut it on your own or force the whole body into one category; show the shape and confirm how to separate it. Head-derived and body-derived components cannot be mixed in the same group. If there are accessories you want to make independent on both sides, show the relevant locations and confirm which one stays with its source part. Do not quietly increase to six sets, or break the head and body placement to merge them.

## Making the reference images

1. Display `guides.front/back` and read the actual outline, outfit boundaries, holes, thickness and asymmetry. If needed, also check in the kit's viewer.
2. Display the adopted multiview images that show that part, and use them as the standard for colors, patterns, materials and painting. The source illustration is a supplement for design that the adopted images do not make clear. Do not revert adopted detail work to the simpler paint of the source illustration.
3. With an available imagegen skill and image_gen, paint one part in one direction at a time. Use [the shared painting guide](../../character-material-brushup/references/painting.md), and preserve skin undertones, the color layers of hair strands, and the sheen of each material. Do not mix third-party observation images into the image input.

Prompt skeleton:

> Create one standalone [front/back] illustration of ONLY [specified mesh group]. Image 1 is the actual mesh wire guide and defines the part boundaries and geometry. Images 2 onward are the adopted painted multiview references and define colors, patterns, material finish and illustration quality. Preserve the exact component set and garment cut, including disconnected pieces in their original relative positions. Remove wireframe, viewport UI and clay shading. Render a straight-on orthographic view, centered in a square transparent PNG with the full silhouette and margin. Match the paired view's scale and vertical baseline. Preserve painted material highlights and local color; omit cast floor shadows and external colored lighting. Do not add missing body parts, accessories or new seams. [State observed painting details.]

For the lower body, set `[specified mesh group]` to `the complete clothed lower body, including the waist outfit, skirt or trousers, legs and footwear shown in the guides`. Add `Keep the outfit worn as designed; preserve its coverage and occlusion. Do not remove garments or depict separate uncovered legs or concealed anatomy.` The guides themselves must also combine the skirt, legs and shoes; do not compensate for the outfit with wording alone.

Front and back are separate square PNGs at 512–8192px, usually the same size. Check actual alpha, the full silhouette, vertical position and matching scale by visual inspection. Do not reproduce screenshot UI, uneven margins or camera tilt. A simple cutout, an upscale or a UV sheet does not replace making these references. Also check color continuity between different groups, such as skin and outfit.

Save the actual prompt in the PNG metadata, and register the images with `references` in `scripts/tripo-project.mjs` for the target group. What goes into the kit is **newly made output images for this part**. Do not add copies of the adopted multiviews or the source illustration, or third-party images you observed.
