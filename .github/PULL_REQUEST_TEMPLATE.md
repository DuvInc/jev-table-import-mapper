## What this changes

<!-- One or two sentences. If it fixes an issue, write "Fixes #123". -->

## Why

<!-- What was mapped wrongly, or what could not be expressed before. -->

## Checklist

- [ ] `npm test` passes locally
- [ ] Commits are signed off (`git commit -s`); see CONTRIBUTING.md
- [ ] If `lib/mapper.mjs` changed: a test case shows the new behaviour
- [ ] If the model, the prompt or the transport changed: the model is named,
      with mapped / questions / calls / cost per sample file affected
- [ ] `lib/` is still pure outside `lib/jev.mjs`: no env var, no socket, no log
- [ ] No new dependency, or it was discussed in an issue first
- [ ] No real export, and no key, is included in this diff
