# Registering reference views

Reference views are not registered in `imageLibrary` part slots; they are saved in `threeViews` and `assets/three-view/`. `side` is the character's own right side and corresponds to the `right` view in the edit screen.

`views.json`'s relative paths are resolved based on this config file.

```json
{
  "input": "project.charakit",
  "views": [
    {"view":"front","file":"work/three-view/front.png","prompt":"the actual front generation instruction used"},
    {"view":"side","file":"work/three-view/side.png","prompt":"the actual character's-own-right-side generation instruction used"},
    {"view":"back","file":"work/three-view/back.png","prompt":"the actual back generation instruction used"}
  ]
}
```

```text
node scripts/update-three-views.mjs views.json project.charakit
```

Save to the same canonical project as the input. Save the actual prompts inside the PNGs and the image hashes, and preserve the source illustration, part images, model and placement. Newly registered images are saved with `autoFit:true`, and are tentatively aligned once when a model becomes available in the app's model editing. Existing adjustment values such as position, size, opacity, lock and hidden state are retained on re-registration.

For a correction of only one specified direction, put only that one item into `views` and specify the current reference asset's `sha256` as `expectedSha256`. Do not regenerate other directions. Do not treat redrawing an image as a change made to the 3D model.

For independent initial ZIP delivery, add the same 3 items as `threeViews` to the existing 8-image `images` setting. `scripts/package-images.mjs` puts `three-view/front.png`, `three-view/side.png` and `three-view/back.png` into the same ZIP as the 8 images. Importing the app's image set ZIP also registers the reference views automatically. The conventional 8-image-only ZIP and the legacy 12-image ZIP can also be imported.
