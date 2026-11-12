// Editing: the user's changes on top of the original, the mihomo YAML they
// produce, and the saved settings file.
export { applyChange, ChangeError, validateChange, type Change, type Value } from './changes';
export { detectStyle, writeYaml } from './output';
export {
  checkFolder,
  checkHijack,
  checkHostPort,
  checkHours,
  checkHttpsUrl,
  checkPorts,
  checkSecret,
  DASHBOARDS,
  GEO_FILES,
  randomSecret,
  SNIFF_PROTOCOLS,
  TUN_STACKS,
  type GeoFile,
  type SniffProtocol,
  type TunStack,
} from './expert';
export { compareConfigs, outputNames, type Comparison, type DiffLine, type Hunk } from './compare';
export { categoryOf, planRebase, type Category, type Choice, type Conflict, type Note, type RebasePlan, type RebaseResult } from './rebase';
export { exactNames, linkedCopy, planLink, plain, PROVIDER_NAME, type LinkBlocker, type LinkLoss, type LinkPlan } from './link';
export { BUILT_IN_TARGETS, namesInUse, renameChanges, renameRuleTarget, ruleTargetOf, splitRule } from './references';
export {
  addServersChanges,
  groupsOf,
  groupsWithAllServers,
  removeBlockers,
  removeManyBlockers,
  removeManyChanges,
  removeServerChanges,
  serverNames,
  uniqueName,
  type Group,
  type RemoveBlocker,
} from './servers';
export {
  addGroupChanges,
  addMemberChanges,
  checkNewName,
  GROUP_TYPES,
  groupUses,
  hasOtherMembers,
  memberChoices,
  moveMemberChanges,
  removeGroupChanges,
  removeMemberChanges,
  setGroupTypeChanges,
  wouldLoop,
  type GroupType,
  type GroupUse,
} from './groups';
export {
  ADDABLE_RULES,
  addRuleChanges,
  checkRuleValue,
  insertPosition,
  IP_RULES,
  moveRuleChanges,
  readRule,
  removeManyRulesChanges,
  removeRuleChanges,
  removeRuleProviderChanges,
  ruleProvidersOf,
  rulesOf,
  ruleSetUses,
  setRuleTargetChanges,
  type AddableRule,
  type RuleProviderView,
  type RuleView,
} from './rules';
export {
  addToDnsList,
  checkDnsServer,
  checkDomainPattern,
  checkPlainDnsServer,
  checkPolicyPattern,
  DNS_LISTS,
  dnsOf,
  moveInDnsList,
  policiesOf,
  removeFromDnsList,
  removePolicyChanges,
  setPolicyChanges,
  type DnsList,
  type PolicyView,
} from './dns';
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
