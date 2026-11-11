// Editing: the user's changes on top of the original, the mihomo YAML they
// produce, and the saved settings file.
export { applyChange, ChangeError, validateChange, type Change, type Value } from './changes';
export { detectStyle, writeYaml } from './output';
export { BUILT_IN_TARGETS, namesInUse, renameChanges, renameRuleTarget, splitRule } from './references';
export { build, fixToChanges, startSession, type Built, type Session, type Source, type SourceKind } from './session';
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
