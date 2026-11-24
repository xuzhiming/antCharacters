# View the model, match it, and finish expressions beautifully

[日本語](expression-authoring.ja.md)

This is an optional stage where the agent decides how the eyes, mouth, and brows correspond using the images and the model, fits and transfers them with the bundled scripts, and refines the necessary local areas in Blender. 8 eye, 10 mouth, and 5 brow keys can be handled separately. You can also request only some of them. The goal is not mechanically saving every expression, but comparing and producing a natural, cute finish that suits that model.

## How to do it

For the eyes, align the 8 points — inner eye corner, outer eye corner, and top and bottom — on a simplified mask of skin only, and transfer while explicitly specifying separate eyelashes and so on. For the mouth, check the original opening and map the upper and lower lip edges separately. Avoid confusing nearby lips, and distribute the deformation into the connected surrounding skin. Transfer the brows from separate parts, and make the area around the brows follow only when needed. Blinks and brow emotions can be adjusted separately.

Check the front, 45 degrees left and right, and profile, along with intermediate strengths and combinations of eyes, mouth, and brows. As needed, refine the distribution of eyelid deformation across multiple rows, the outer eye corner, the impression of the brows, the depth of the curvature, and the overall arc of the mouth. Use Computer Use editing and helper scripts as appropriate. Distinguish features of the source model, such as pointed eyelashes, from distortion introduced by the transfer; the work is complete when the result looks natural and cute on viewing. Additional on-screen editing is not a required step.

## Using it from the kit

[The production Skill](../skills/avatar-expression-authoring/SKILL.md) is the entry point. Request production from the top right of the "Expressions" tab, which comes after rigging, then copy the request text and give it to the agent. For models without expressions, the adjustment fields are disabled; they become usable after authoring or importing.

"Import expressions" supports VRM 0.x/1.0, GLB files that contain expressions, and character kits. Choosing a character kit opens the whole project and resumes it. If an authored GLB or review VRM is bundled, its expressions are listed automatically. Custom expression names are also kept.

Select an expression, set the strength and the minimum and maximum values, and combine multiple expressions to check them. The range for VRM expressions is 0–1, and for custom deformations it is -10–10. The selection, strength, range, and the imported source model are saved to the character kit. These are preview adjustment values and do not rewrite the source VRM. To fix the face shape itself, ask the agent or use the expression lab on the authored data in Blender.

To request directly, you can say something like this:

> Use the bundled avatar-expression-authoring to create eye, mouth, and brow expressions for this model. Keep the impression of the neutral face while giving it a natural, cute finish, and show comparisons from multiple directions and at intermediate strengths.

Blender 5.2 or later is used. For MToon display, use the VRM Add-on and a display material copy, with color management set to Standard. Use solid/wireframe for structural checks. The kit includes a comparison screen that overlays the target, the current state, and the pre-correction state, capture and save helpers, and diagnostic material that is read only when needed.

You can resume from current.blend in the same production folder. The original, Basis, existing keys, UVs, faces, and materials are preserved. The inside of the mouth and textures are not newly created. Results are returned to the same project as optional Blend, GLB, and comparison images, and the existing VRM is not changed. Visual adjustment according to the shape is required, and there is no guarantee that any model will be finished without edits.

## Assets

skin-blink-mask.json contains 988 skin vertices and the 8 eye poses from base_simple.blend, which the kit author created. feature-poses.json extracts the separate brows from the same asset and the upper and lower lip edges from base_simple_mouth.blend. It does not include the finished test model or any specific vertex indices, fit coordinates, or local paths. Like the other bundled assets, [LICENSE](../LICENSE) terms apply, and taking the assets out on their own or redistributing them is prohibited.
