# Test configs

Configs the core's tests read. Everything in this folder is made up: fake
servers, fake passwords, fake URLs. There are booby-trapped ones too, to prove
the safety checks work (PLAN.md Q26).

`private/` is for real configs (from your provider, Wannaflix, addohm.net).
Git ignores everything in it except its README, because real configs hold
working credentials. Never move one out of `private/`.
