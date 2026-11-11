// Editing: the user's changes on top of the original, the mihomo YAML they
// produce, and the saved settings file.
export { applyChange, ChangeError, validateChange, type Change, type Value } from './changes';
export { detectStyle, writeYaml } from './output';
export { BUILT_IN_TARGETS, namesInUse, renameChanges, renameRuleTarget, ruleTargetOf, splitRule } from './references';
export {
  addServersChanges,
  groupsOf,
  groupsWithAllServers,
  removeBlockers,
  removeServerChanges,
  serverNames,
  uniqueName,
  type Group,
  type RemoveBlocker,
} from './servers';
export { build, buildDoc, fixToChanges, startSession, type Built, type BuiltDoc, type Session, type Source, type SourceKind } from './session';
export {
  readSettings,
  SETTINGS_ERRORS,
  SETTINGS_EXTENSION,
  SETTINGS_FORMAT,
  SETTINGS_VERSION,
  writeSettings,
  type ReadSettings,
  type SettingsErrorCode,
} from './settings';
