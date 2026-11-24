# Notes for exploring the Tripo screen

These items were checked in the Tripo Studio Japanese UI on 2026-09-25. After the screen is updated, the labels and previews actually visible take priority. The following is a supplement to the operation contract, not a demonstration of every stage on a real model.

- `https://studio.tripo3d.ai/workspace/generate`: Smart Mesh P2.0, quad faces 500–25,000, 1/2/4 generations. Settings are saved automatically, so check every value when you start work.
- The cube icon is four-direction multiview. The icon with stacked images is batch input of up to 30 images, and is a different feature.
- `https://studio.tripo3d.ai/workspace/smart-uv`: OBJ/FBX/STL/GLB, up to 150MB. The displayed limit is 80,000 triangles / 40,000 quads. There is a warning that existing textures will be lost, so save the output before moving on.
- `https://studio.tripo3d.ai/workspace/texture`: single image / multiview / text. You can check front and back references, 2K/4K/8K, and the Remove Lighting setting. Always choose 4K.
- FBX export has profiles for Blender/Mixamo/3ds Max and others. Start from Blender, and use [tripo-studio-download](../../tripo-studio-download/SKILL.md) for the normal Export and the actual-file check. After fetching, check orientation, units, quad faces and texture embedding.
- Do not hand `.charakit` directly to Tripo. Upload only the target FBX and the reference images you need. Match the model names and download names on the service to the saved group IDs.

Official supplementary material: [P2.0](https://www.tripo3d.ai/blog/tripo-p2-0-preview), [Smart UV](https://www.tripo3d.ai/blog/smart-uv). If the description and the screen disagree, investigate the current screen and the actual downloaded data; do not proceed by guessing unknown values.
