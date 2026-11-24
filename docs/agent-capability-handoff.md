# Agent capability handoff

This page splits the production workflow between what a local code agent can automate and what a person, or a different agent, must do. The kit assumes an agent with image generation, browser control, Blender MCP and Computer Use. A text-and-code agent can run the local half of the workflow but not all of it.

Use this page to decide who does each stage, and hand over files at the boundaries described here.

## Stage map

| Stage | Produces | Typical agent | Manual substitute |
| --- | --- | --- | --- |
| Images | 8 part images and 3 reference views | Image-capable agent (for example Codex) | Draw or generate them yourself, or import an existing ZIP |
| Image edit | One revised image | Image-capable agent | Revise the image yourself and import it |
| Candidates | 4 head and 4 body candidates | Browser-capable agent signed in to Tripo | Operate Tripo Studio yourself |
| Materials | Segmented, UV-mapped, retextured, assembled model | Browser-capable agent for Tripo; local agent for assembly | Operate Tripo Studio yourself; hand the FBX to a local agent |
| Rig | Rigged model, weights, springs, VRM | Browser-capable agent for Tripo rigging; local agent for weights, springs and VRM export | Operate Tripo rigging yourself; hand the FBX back |
| Review and save | Finished VRM and Blend | User | — |
| Expressions (optional) | Expression keys and comparison images | Agent with Blender/Computer Use | Adjust in Blender yourself |

## Capability matrix

| Capability | Used in | Local code agent | Manual substitute |
| --- | --- | --- | --- |
| Text, code and file operations | All stages | Yes | — |
| `.charakit` inspection, update and registration | All stages | Yes, with the bundled CLIs | — |
| Blender scripting (headless) | Assembly, weights, springs, VRM export | Yes, when Blender 5.2, the VRM add-on and the scripts are available | Run the same scripts from Blender's Scripting workspace |
| Image generation and painting | Images, image edit, material brush-up | No | An image-capable agent, or your own tools |
| Browser operation in Tripo Studio | Candidates, segmentation, Smart UV, retexturing, rigging | No | Do it yourself in a signed-in browser |
| Account, plan and paid actions | Tripo | No | The account holder decides and pays |
| Interactive Blender editing and Computer Use | Expressions, local shape fixes | No (headless scripts only) | Edit in Blender yourself |
| Final visual judgement | Every checkpoint | No, by design | The user |

Never share credentials with an agent. Use the normal login in your own browser.

## What a local code agent can do once the files exist

With Node.js 22 or later, Blender 5.2, the VRM add-on for Blender and the bundled scripts, an agent can:

- inspect, unpack and update the canonical `.charakit`;
- register the 8 part images and the 3 reference views;
- triangulate and assemble the GLB, apply MToon and save the assembled Blend;
- read back the bone placement, transfer base-body weights and set up springs;
- export the VRM and run the automated structure, material and physics checks;
- report technical failures and stop at the user checkpoints.

It cannot generate images, operate Tripo Studio, decide aesthetics or perform interactive Blender edits.

## Per-stage handoff

### 1. Images

**Manual work.** Generate the head (including hair) and T-pose body in four directions each, then the three full-body reference views. Use an image-capable agent or your own tools. Keep the source illustration as the design basis.

**Hand over to the local agent.** A ZIP containing the 8 part images and 3 reference views. The agent registers them with `scripts/update-images.mjs` and `scripts/update-three-views.mjs`, or you import the ZIP with **Import ZIP** in the app.

**Checkpoint.** Review the 8 images and the reference views in the app.

### 2. Image edit

**Manual work.** Revise only the selected image. The agent can replace the image in the existing project once the revised file exists.

**Checkpoint.** Review the corrected image, or confirm the correction content only.

### 3. Candidates

**Manual work.** Generate 4 head and 4 body candidates in Tripo Studio and export them with the standard Export. Do not rely on download-event waiting. Export the actual files and check them before saving.

**Hand over to the local agent.** The exported FBX files, named by candidate group. The agent checks the real files and registers the candidates.

**Checkpoint.** Choose the head and the body separately. The agent never decides adoption.

### 4. Materials

**Manual work in Tripo.** Triangulate, run the coarse segmentation, classify the parts visually, assign the five texture categories, create Smart UVs, retexture at 4K and export. The five categories are hair, head, upper body, lower body (waist outfit, skirt or trousers, legs and shoes) and other accessories. Spring-part separation is judged and kept separately.

**Local work.** Assemble the returned parts, apply MToon and save the assembled Blend. `scripts/production.py assemble` calls `scripts/mtoon-export.py` for the required meshes.

**Checkpoint.** Adjust proportions by position and size.

### 5. Rig

**Manual work in Tripo.** Rig the head and body without the already placed hair, then return only the bone placement. Keep the source mesh.

**Local work.** Read back the bone placement, transfer base-body weights, set up hair and outfit springs, export the VRM and run the automated checks. Register the Blend and the review FBX together so the settings are preserved.

**Checkpoint.** Check the motion and appearance of the finished VRM. Passing checks does not mean the appearance is approved.

### 6. Review and save

The user checks motion and appearance, then uses **Export VRM** and **Save information and export**. No agent request is needed. Keep the whole production folder, including `work/character.blend` and `exports/`, when moving or backing up.

### 7. Expressions (optional)

Expression authoring requires visual comparison and editing in Blender, including Computer Use for local finishing. Helper scripts can prepare the mask, transfer the motions and save the result, but the final shape adjustments are manual.

## Handoff checklist

Before asking an agent to continue, provide:

- the canonical `project.charakit` and its production folder;
- the original illustration and any design notes;
- the image ZIP, or the Tripo FBX exports, with a note on which stage produced them;
- the working Blend when the next stage needs existing weights, materials or springs.

When handing work back, keep the same canonical project path. Do not create dated or `final2` copies.

## Environment check

Confirm the real state before starting; do not assume a feature is available.

```bash
node --version                 # 22 or later
npm start                      # local app; PORT to change the port
```

- Blender 5.2 or later, with the VRM add-on and Blender MCP enabled.
- A browser signed in to Tripo for the Tripo stages.
- `BLENDER` set only when Blender cannot be found automatically.

## Safety and responsibilities

- Do not display or collect credentials. Use the legitimate login in your own browser.
- Confirm additional purchases, plan changes and paid processing outside the request.
- Do not delete, move or overwrite originals or existing artifacts without permission.
- Automated checks cover structure, materials and physics response. They do not grade appearance.
- The user decides candidates, proportions, motion and the final look.

## Related

- [AGENTS.md](../AGENTS.md) — shared rules and stage checkpoints.
- [Tutorial](tutorial.md) — the first avatar, screen by screen.
- [Browser use](browser-use.md) — choosing and reusing a browser.
- [Skills](../skills/) — the per-stage production instructions.
