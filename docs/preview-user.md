# Motion check and VRM saving

[Tutorial](tutorial.md) · [日本語](preview-user.ja.md) · [한국어](preview-user.ko.md) · [简体中文](preview-user.zh-CN.md)

"Motion check" is the screen for visually checking a VRM whose automated checks — structure, MToon, textures, and per-part physics response — have passed. It appears automatically even when model information is not registered, and starts the default walk automatically with physics ON. The user judges whether the appearance is good or not.

- Choose the motion with "Default (walk)" on the left and "Load motion (VRMA)" on the right. While the screen is open, you can switch loaded motions with the default. Use "Change" to replace one.
- "Pause" stops only the animation. Grab and move the model with the mouse to check the physics-based motion. Dragging the background moves the camera.
- You can use "Rest pose" and "Show bones". "Reset physics" resets the motion while keeping the model's position and pose.
- In "Export VRM", confirm the model name, author name, and usage terms; "Save information and export" saves the information and downloads the file. Saved information is reused next time. Shape, materials, and spring parts keep the checked content. You can continue Motion check even after canceling. No request to the agent is needed.

The standalone preview, display-only toon adjustment, time slider, saving of review images, and bone-mapping editing have been removed. MToon uses the finished VRM's own materials. The pose, the position during review, and the loaded VRMA are not reflected in the saved VRM content. After reloading, it opens with the default walk.

The local version prepares automatically from the working Blend. If preparation or checks fail, it shows the reason and does not treat them as successful. See [the standard production workflow](tutorial.md) for details.
