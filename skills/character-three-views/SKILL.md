---
name: character-three-views
description: Reference the source illustration and finished part images, create front, character's own right side and back reference views for adjusting the balance of proportions, neck and full body, and register them into .charakit. Use after part image production, or for producing and revising reference views alone.
---

# Full-body reference views for balance adjustment

Part images are produced first using the single source illustration as the design basis. This Skill creates the full-body front, the character's own right side and the back that are overlaid during model editing afterward. Do not produce reference views first and replace the part production basis, and do not change the source illustration, part images or 3D model to match the reference views.

## Input and production

1. Display the source illustration and the finished head (including hair) and body images. Use the source illustration for facial features, hairstyle, outfit, color scheme and proportions as the design basis, and the finished part images for confirming consistency of direction, structure and painting. Do not interpret each part image's screen occupancy as the actual size ratio of head and body.
2. Inherit the character's left and right, upright neutral face, T-pose and foot spacing from the [part and direction contract](../character-parts-images/references/part-contract.md). The full body includes the full hair length, outfit, limbs and shoes. The side view is the character's right side, with the front of the nose, chest and toes facing screen right. Do not duplicate asymmetry by mirroring.
3. Use the built-in image_gen and the available imagegen skill, and generate one direction and one individual at a time with the [generation instructions](references/prompts.md). Explicitly input only the source illustration and adopted images you may use. Follow the [common painting standard](../character-material-brushup/references/painting.md) and inherit the expression of the already finished parts. Do not add new painting methods or decorations for the reference views. Proceed to [character-material-brushup](../character-material-brushup/SKILL.md) only when painting improvements are requested.
4. Using the front as the basis, align the crown, chin, neck, shoulders, waist, knees and shoe sole heights, the proportions and the hair length across side and back. Save 3 PNGs with genuine alpha that contain the full outline at the same dimensions, scale and margins. Do not draw perspective exaggeration, text, dimension lines or a checkerboard pattern. Do not substitute code-based part stitching or outline deformation for redrawing.

Display the generated 3 images and check the source illustration's design and proportions, consistency with the finished parts, neck connection, character's left and right, and the same foot reference. Treat supplementation of hidden surfaces as an estimate. If the same problem does not improve after two corrections, stop continuous editing and communicate the residual. Reference views are references for matching ratios, and do not report that 3D consistency has been verified.

## Saving and automatic app integration

In the local combined images request, after registering the 8 images with `scripts/update-images.mjs`, register the 3 images into **the same canonical project** with `scripts/update-three-views.mjs` following the [registration format](references/delivery.md). Run the request text's complete only after the reference view registration is also finished. The app reloads the canonical project and displays them automatically in model editing. If a model is available, the first time only, it tentatively aligns to its full height and soles after removing transparent margins, and retains later manual adjustment values.

In independent image ZIP delivery, bundle the 8 images and the 3 reference views into `threeViews` of `scripts/package-images.mjs`. For a reference-views-only request, use `update-three-views.mjs` and do not recreate the part images. Save the actual prompts and do not bundle copies of the source illustration, third-party images, history or explanatory HTML.
