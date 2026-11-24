# 全身三面図の生成指示

元絵と使用できる完成部位画像を画像入力として指定し、各画像の役割と実際の特徴を以下へ追記します。元絵にしかない細部と、完成部位に見える細部が矛盾する場合は、元絵のデザインを保持して観察可能な違いを扱います。元絵の姿勢だけは直立・通常顔・Tポーズへ整えます。

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

正面の全身画像が完成した後、他方向にはその全身画像も尺度の基準として渡します。部位生成へこの三面図を逆流させません。生成指示の実文を保存します。
