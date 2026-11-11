# Hostile inputs

Booby-trapped files the intake must refuse, each with a comment saying why.
The tests in `core/src/intake/intake.test.ts` load every one. Inputs that are
too big or nested too deep to keep as files are made by the tests.
