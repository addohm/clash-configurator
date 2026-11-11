# Test configs

Configs the core's tests read (PLAN.md Q26). Everything outside `private/` is
made up: fake servers (documentation addresses), passwords and URLs.

- `configs/`: shapes real configs come in, which intake must accept.
  `risky.yaml` has every risky setting the checks flag.
- `hostile/`: booby-trapped inputs intake must refuse (see its README).

`private/` is for real configs (from your provider, Wannaflix, addohm.net).
Git ignores everything in it except its README, because real configs hold
working credentials. Never move one out of `private/`. The tests check that
each one is accepted; run them with `tools\update` (option 3) or `npm test`.
A failure shows only the refusal reason, never the config's contents.
