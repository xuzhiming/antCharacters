# Separating and directing the head (including hair) and body

## Part boundaries

| Destination | Include | Do not include |
|---|---|---|
| `head` | Neutral face, eyes, brows, ears, head, all of the bangs, side hair and back hair, and head-owned accessories such as hair ornaments | Neck, shoulders, body, clothing collar or hood |
| `body` | Neck that inserts into the head, outfit, limbs, shoes, and outfit-owned accessories, collar and hood | Head, face, hair, handheld items, floating UI |

All long hair also belongs to the head. Even if the hair tips reach the waist or legs, do not cut at neck height. Maintain and supplement the back hair that becomes visible after removing the body. Ears or skin showing on the head is normal. Do not rebuild the head as a hairless skull, and do not generate a hair-only wig separately.

The neck belongs only to the body. The head is the head down to the jaw and back of the head plus all hair, and the body is from the neck down, with the top of the neck on the body side shaped so it can insert into the head. The head and neck meshes do not need to be connected. Do not make cut surfaces, pedestals or supports stand out as new parts.

For hats, animal ears, horns, etc., judge attribution by the attachment relationship in the original design and do not duplicate them across the 2 parts. Confirm large uncertainties, and proceed from the parts you understand. Supplement hidden backs conservatively from existing structure and distinguish them from generation estimates.

## Left/right contract

Left and right are from the character's perspective. Write both the "visible side" and "screen front" in each generation instruction.

| File | Visible surface | Direction of nose, chest and toes | Character's left accessory |
|---|---|---|---|
| front | Front | Viewer | Screen right |
| left | Character's left side | Screen left | Near side |
| right | Character's right side | Screen right | Far side, following occlusion |
| back | Rear | Away | Screen left |

Side views are 90 degrees. Do not duplicate asymmetry by mirroring; specify visible and hidden accessories concretely. Do not assume the names match an external service's Left/Right labels.

## Posture and scale

Regardless of the source illustration's tilt, make the head front a true front with both eyes' reference height horizontal and the facial centerline vertical. Correct head tilt, looking up and looking down, and do not mechanically symmetrize the original facial features or hair/accessory asymmetry. Arrange the hair in a still, natural fall and do not change the wind direction or flow across the 4 directions.

New head assets have a neutral expression. Close the mouth naturally, relax the brows and eye area, and keep the eyes naturally open. Do not inherit the source illustration's smile, open mouth or emotional brow and eye movement. Preserve the facial features, eye design, makeup, shading and gloss, and do not thin the painting in order to normalize the expression. Maintain the same expression as the upright head posture in other directions and change only the specified viewing direction. For local painting-only corrections of existing images, keep the adopted state unless a posture or expression change is also requested.

New production bodies are always in a T-pose. Extend the upper arms horizontally at shoulder height and keep the elbows and wrists straight. Slightly open the legs to about hip width, point the knees and toes forward, and do not offset them front or back. In front and back views, leave a background gap from below the knees through the inner sides of the left and right shoes, and do not let the shoes touch or cross. Keep the opening small enough for a natural upright stance; do not create the gap with a wide straddle. Even if the source illustration has closed legs, adjust new body assets to this posture and secure separation without changing the body shape or shoe width.

Check the sleeves against the torso and the outlines of the limbs, and maintain the same joint posture and foot spacing in all directions. In side views, left and right legs and shoes overlapping in projection is normal, so do not shift the legs front or back or lower the arms to show them. Only local corrections of legacy images stay within the requested scope. Shoe separation is an input condition that helps the later left/right judgment and does not replace weight checks on the generated 3D.

Read the crown, eyes, chin and longest hair tips for the head, and the top of the neck, shoulders, wrists, hem and shoe soles for the body from the adopted image and align them across other directions. The head and body may use different scales. Maintain hair length in relation to positions such as the original character's shoulders, waist and knees. Coordinate specifications before generation are targets and are not evidence of precise output matching.

## Legacy data

The legacy 3-way split `head`, `hair` and `body` remains for import compatibility. For single-image edits of legacy kits, work with the original part boundaries and do not automatically add hair to a hairless head. For a request to migrate to the 2-way split, regenerate the head (including hair) using the source illustration and existing head and hair as auxiliary references, and do not settle for a mere file rename or image compositing. Do not delete unspecified legacy images or models.
