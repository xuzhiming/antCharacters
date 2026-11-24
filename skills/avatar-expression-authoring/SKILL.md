---
name: avatar-expression-authoring
description: Create and refine attractive avatar facial expressions in Blender using agent-fitted eye masks, separate lip-rim transfer and brow poses, then compare and return editable results to the kit project.
---

# Finish expressions beautifully and in a way that suits the model

The goal is a natural, cute expression close to the sample. Successful transfer, saving or tests are not the completion test. The agent looks at images and structure to decide the parts, the bundled tools perform the iterative computation, and the necessary areas are finished in Blender.

Use comparison with the neutral face to separate the model's own expression, such as pointed eyelashes, from distortion caused by the transfer. It is complete when it looks natural and cute at viewing size and is within the user's tolerance. Do not require revision just because roughness shows at close range, and use additional Computer Use when it is needed.

## Production flow

1. **Look at the face.** Make a working copy from the current model and match the face orientation and capture range. Start by looking at the neutral face with hair, and at the skin, eyelashes, brows and the actual lip edges. Check structure in Solid/Wireframe and the impression in MToon + Standard. Once the target is clear, do not insert automatic detection or unnecessary list generation. [Preparation, capture and saving](references/commands.md).
2. **Specify the correspondences and build the base.** Read [the transfer procedure](references/transfer.md) and proceed only with the parts you need. For the eyes, specify eight points and follower parts on a skin-only mask. For the mouth, check the upper and lower lip edges separately and transfer motion to those arcs. For the brows, specify the separate left and right parts. If the request covers all expressions, you can use the bundled 8 eye, 10 mouth and 5 brow expressions. Check the fit in images before transferring in bulk.
3. **Compare with the sample and fix.** First look at representative closed eyes, "aa", smile and angry brows, and fix shared misalignment by going back to the fit. For individual outer eye corners, thickness and mouth corners, also use ordinary editing through Computer Use. Use scripts or MCP for preparation and capture, images for judging shape, and whichever operation is easiest for local finishing. Do not make everything clicks or everything CLI.
4. **Present the result.** Compare each expression with the neutral face, and check the left and right 45 degrees, the profile, intermediate strength, and combinations of eyes, mouth and brows. If there is a transfer-derived problem that harms the expression's impression and you know how to fix it, fix it; if it is sufficiently finished, save it and return it with comparison images. You do not need to recapture every combination each time you rebuild a single part.

## Key points for judging shape

- For a blink, start from roughly 90% upper eyelid and 10% lower eyelid, and reduce the movement from the center toward both ends. Do not translate the whole eyelashes downward in parallel. If only the single row directly above the eyelid stretches, distribute the movement across several rows.
- The basic tool is proportional editing with "Connected Only". Repeat moving broadly, then restoring the surroundings from other vertices. It is expected that separated eyelashes move alone, or that partial fusion makes unwanted areas move. Adjust skin and parts in order.
- Even if the eye closes from the front, the eyelid may float forward in profile. The bundled closed-eye assets have almost no front-back motion, so do not treat depth as finished with the eight-point fit alone. Follow the head's surface curvature in depth as well as up and down. The same applies to the mouth. Do not assume X-mirrored vertex editing on Tripo-derived asymmetric topology.
- If the brows drop during a blink, the face looks sad. Restore the neutral face's brow position and impression, and smoothly redistribute the skin beneath them. Add brow emotion with a separate key.
- Do not create a smile with the mouth corners alone; look at the upper and lower lips, the center, the thickness and the surroundings together. Do not determine the actual mouth from texture lines alone.

Read only when needed: [anatomy and deformation](references/anatomy.md) for structure and part identification, [diagnostics](references/diagnostics.md) when there are symptoms, and [visual standards](references/visual-quality.md) for judging completion.

## Samples and records

The bundled poses are references for motion. When applying them to a different face, prioritize the character's own likeness, and if needed create a target by image generation from the fixed-camera neutral face. Keep the same positions for front, 45 degrees and profile, and check that the generation did not change hair, brows or facial features. If a target already exists, regeneration is unnecessary.

A short record is enough. Leave "difference from the target → change → before/after images → adopt or revert → next step" and the user's evaluation in the production folder. Numerical checks are an aid to preventing corruption. If you cannot observe something, cannot judge the structure, or need new geometry, ask with images and the reason. Do not stop revising based on a count alone, or treat an unverified look as passing.

## What to preserve

Preserve the original, the Basis, existing keys, UVs, face structure and existing materials. Do not newly create a mouth interior, teeth, tongue or textures to hide defects. Do the MToon conversion needed for displaying the eyes on a display copy. Save the target model's numbers and coordinates only in that production folder, and do not embed them in the shared tools. You may check shape without hair, but also look at the impression with hair at the end.

Return the result to the same project as independent optional data. Do not register it automatically into the existing VRM, and do not conform to the legacy format that requires all VRM expressions. This is a tool for applying to models with different facial geometry; it is not a guarantee of a finished result without modification on any structure.
