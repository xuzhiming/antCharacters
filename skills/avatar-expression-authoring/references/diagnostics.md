# Move from symptom to revision

| Symptom | Check first | Revision and recheck |
| --- | --- | --- |
| Closed eyes look troubled or sad | Overlay the target and the neutral face, and look at the brow position, tilt and shape | After the broad deformation, restore the brows and surroundings, and smooth the transition from below the brows to the eyelids. |
| The original mouth line remains above / the lower surface opens unnaturally | Look for the actual upper and lower lips in Solid, obliquely, with a small test deformation | Undo the wrong attempt and rebuild from the confirmed lip edges. Do not hide it by adding a mouth interior. |
| Only the surface directly above the eyelid is vertically long | Compare the spacing of rows in Wireframe from the same camera | Widen the influence toward the brows, and layer movement of several points with restoration of the surroundings. Also relieve concentration caused by local pinning. |
| Patterns stretch greatly | Without changing UVs, look at the eyelash painting and the edge lengths of nearby faces | Do not pull only the vertices right on the line; attenuate the movement over a wider range. |
| The closed eye looks swollen / bulges forward | Look at the depth of skin, eyelashes and eye at profile and left/right 45 degrees | Using the outer skin as reference, adjust the front-back position corresponding to Y, and connect the curvature from the forehead to the eyelid. Check the axis for each input. |
| A fine line on the upper eyelid remains after correction | Switch to Solid and see whether a plate-like ridge or step remains even with textures off | Do not assume it is only a line in the material; select the row of raised skin and adjust locally. If script smoothing does not improve it, switch to ordinary Blender editing and check the shape. |
| Black dots, triangles, protrusions at the outer eye corner | Select the faces and compare with the original components and depth | Separate hair direction, folded bands and iris penetration. Record the guess and correct it with actual geometry. |
| Only the eyelashes move and the skin remains | Check connected components and partial fusion | This is expected. Select the skin again and make it follow, then restore the excessive deformation at the joined area. |
| Teeth or mouth-interior parts are left in the center of an open mouth | Look in Solid at the existing parts and their connections to the upper lip, lower lip and chin | Split the parts attached to the upper side from those attached to the lower side, and make them follow with work keys. Also check intermediate strength and thickness from the side, and do not create new parts or materials to hide it. |
| Only full closure looks good, and intermediate values are unnatural | Check 25/50/75% and combinations of eyes and mouth at left/right 45 degrees and profile | Correct the movement at the ends, thickness, depth against the eye, and the following of separate parts. Do not consider only maximum strength finished. |
| Only the front matches and the profile breaks | Look at the fixed-camera target and current image, and the supporting surfaces from the side | Separate a target camera offset from an actual shape mismatch, and adjust depth. Do not warp the target to hide it. |

## Recording iterations

For each attempt, record the symptom, hypothesis, target part, operation and range, images viewed, observation, and adopt/revert. Numerical flips and edge stretching are clues to the cause. Do not aggregate the inner eye socket and the outer skin in the same region, and distinguish edges that were thin to begin with and faces that close.

Do not substitute "the script ran," "the flip count decreased" or "the operation points matched" for an evaluation of a cute, natural expression. Conversely, do not discard a good-looking attempt based on diagnostic values alone. Fix the target and camera, and base judgments on before/after images and wireframes.

## Handoff for resuming

Leave the following in the working folder: identification of the input, target keys, confirmed parts and undetermined areas, the save points adopted, reasons for reverting, the latest comparison, remaining symptoms, and the one operation to try next. Keep the user's evaluation separate from the agent's guesses. Do not add an individual model's numbers or working paths to shared material.

## Also check the shared tools' interpolation

If gray triangles or steps appear at the boundary of the depth correction, look at MToon and Solid from the same angle. Separate wrong outer support points, loss of part thickness from uniform depth, and abrupt switching at the selection boundary. Reduce the depth displacement, change the selection and influence range, and correct depth as well. Do not adopt something merely because it is not noticeable in MToon.

## When correspondences mix up during transfer

- Opening the mouth produces spikes or triangles: check whether the upper and lower lip edges are reversed, or whether closely adjacent lips are being mapped to the same surface. Specify the upper and lower arcs separately and return to the correspondence capture. Do not carry original vertex numbers into another model.
- Surface Deform cannot bind on a non-convex surface: triangulate only the temporary driver. Do not solve it by triangulating the original face.
- The brows stretch the upper eyelid: do not connect the skin directly to the brow driver; distribute the transferred brow displacement onto the skin and protect the eye rim. If the area near the protection suddenly stretches, review the range and distribution.
- The boundary where the brows are restored creases: do not cut the displacement abruptly at a height threshold; connect the displacement from the brows to the eyelids using several rows. Compare not only the brow parts but also lines painted on the skin against the neutral face.
- The pose is not visible in the browser: check the capture target, the key strength and the reloaded file. Distinguish whether only the saved file's drivers are disabled or the actual shape is not moving. Do not mistake the capture copy for the accepted result itself.

- The landmarks in the image match but the mask sinks inward: check at 45 degrees and profile whether the raycast through the opening is hitting skin behind. Do not treat a successful projection as an anatomical ground truth; replace it with the world coordinates of actual eye-rim vertices.
