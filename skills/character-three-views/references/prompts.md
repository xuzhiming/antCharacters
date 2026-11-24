# Full-body reference view generation instructions

Specify the source illustration and usable finished part images as image input, and append each image's role and actual characteristics below. If details that exist only in the source illustration contradict details visible in the finished parts, preserve the source illustration's design and handle the observable differences. Only the source illustration's posture is adjusted to upright, neutral face and T-pose.

```text
Create one full-body [front / character's own right-side / back] orthographic
balance reference of this same character. Image 1 is the original illustration
and controls the character design and intended head-to-body proportions.
The remaining images are finished head-with-hair and clothed body part views;
use them to maintain the established shapes, colors, details and painting.
Their separate crop sizes do not define relative head/body scale.

Keep the entire head, all hair including the longest tips, neck, outfit, arms,
legs and shoes in frame. Keep the original design and intended proportions.
Use a straight upright head and neutral closed-mouth expression, a true T-pose,
and the same small hip-width leg separation as the finished body views.
For the character's own right side, the nose/chest/toes face screen-right;
arms and legs may overlap naturally in projection. Do not move them to expose
hidden surfaces. Preserve asymmetric ornaments on the correct side.

Use the same square canvas size, image scale, vertical centerline and padding
as the accepted front full-body reference. Match the topmost point, chin,
neck, shoulders, waist, knees and shoe soles across all views.
One character, one direction, actual transparent background, no cropping,
labels, measurement lines, perspective distortion or painted checkerboard.
```

After the front full-body image is finished, pass that full-body image to the other directions as the scale basis as well. Do not feed these reference views back into part generation. Save the actual text of the generation instructions.
