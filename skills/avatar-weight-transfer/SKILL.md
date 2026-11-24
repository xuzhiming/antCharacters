---
name: avatar-weight-transfer
description: Before sending to Tripo, visually judge the outfit's spring parts, separate independent components into named objects, and return the kit. Donor fitting and weight transfer are run automatically by the app. Manual transfer for an existing rig is advanced mode.
---

# Estimating spring parts and preparing for transfer

Read `skills/charakit-project/SKILL.md` and the [common rules](../charakit-project/references/common.md), relative to the app's folder.

For a local combined rig request, if a valid weightTransferPlan already exists, do not reclassify; after obtaining bone placement, run transfer-weights in scripts/run-local-job.mjs and continue to spring setup and the automated checks of the completed VRM. Visual sign-off is not the agent's completion criteria; leave it to the user's Motion check. The stop-after-separation behavior below applies to a standalone pre-separation request.

In the standard division of work, Astra judges, separates and names spring parts, and the app performs donor fitting and transfer. Begin the judgment even if bone placement is not available yet. The procedure is in [Pre-separation of spring parts](references/spring-review.md).

- Visually inspect skirts, ribbons, straps and so on, and group independent components into meaningful units. Name the remainder `Body`, and give spring parts clear names such as `Skirt` or `BackRibbon_Left`.
- For parts that are fused and cannot be separated, show a screenshot with the location circled or marked with an arrow, and ask for a decision in plain language, such as "This is connected to the clothes. Should we continue without swinging this part?". Until the user answers, do not cut, omit, or treat that part as not applicable.
- Save the actual separated objects, their names, kinds and separated state to the .charakit. If there are no targets, explicitly record an empty list.
- Return the updated kit; the request is complete once you have guided the user to reopen it in the app. Do not proceed on your own to Tripo operations, donor fitting, transfer or spring setup.
- Whether to include spring parts in Tripo is awaiting the user's verification. For now, even after separation, send the whole appearance including the outfit, excluding only the hair. Do not fill in cases where there is no body under the outfit on your own.

The app's automatic transfer uses the bundled extracted base body (or a replacement base body from the local config), excludes the separated spring parts, and transfers to the body only. Spring parts are held with temporary pinning and handed off to the finishing Skill. A successful computation is not treated as visual sign-off.

Keep the MToon applied when textures were finalized and the model was assembled. When importing the original meshes from FBX, reapply `apply_mtoon(meshes)` from `scripts/mtoon-export.py`, preserve textures, UVs and transparency, and save the Blend after preparation, donor fitting and transfer. The automatic path in `from_guide.py` runs this process immediately after loading.

Read [Manual transfer](references/manual-transfer.md) only when manual transfer is required for the marker path or an existing rig.
