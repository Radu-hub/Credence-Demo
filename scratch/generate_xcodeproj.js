const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '../ios');
const xcodeProjDir = path.join(projectDir, 'PassGateIdentity.xcodeproj');
fs.mkdirSync(xcodeProjDir, { recursive: true });

// PBX IDs
const pbx = {
  project: '1100000128873C3B00000001',
  mainGroup: '1100000228873C3B00000002',
  sourcesBuildPhase: '1100000328873C3B00000003',
  frameworksBuildPhase: '1100000428873C3B00000004',
  resourcesBuildPhase: '1100000528873C3B00000005',
  nativeTarget: '1100000628873C3B00000006',
  targetDebugConfig: '1100000728873C3B00000007',
  targetReleaseConfig: '1100000828873C3B00000008',
  targetConfigList: '1100000928873C3B00000009',
  projectDebugConfig: '1100000A28873C3B0000000A',
  projectReleaseConfig: '1100000B28873C3B0000000B',
  projectConfigList: '1100000C28873C3B0000000C',
  appProduct: '1100000D28873C3B0000000D',
  productsGroup: '1100000E28873C3B0000000E',
  appGroup: '1100000F28873C3B0000000F',
  modelsGroup: '1100001028873C3B00000010',
  servicesGroup: '1100001128873C3B00000011',
  viewModelsGroup: '1100001228873C3B00000012',
  viewsGroup: '1100001328873C3B00000013',
  componentsGroup: '1100001428873C3B00000014',
  passKitFramework: '1100001528873C3B00000015',
  passKitBuildFile: '1100001628873C3B00000016',
};

const swiftFiles = [
  { id: '1100002028873C3B00000020', buildId: '1100003028873C3B00000030', name: 'PassGateIdentityApp.swift', path: 'PassGateIdentity/PassGateIdentityApp.swift', group: 'app' },
  { id: '1100002128873C3B00000021', buildId: '1100003128873C3B00000031', name: 'VerificationModels.swift', path: 'PassGateIdentity/Models/VerificationModels.swift', group: 'models' },
  { id: '1100002228873C3B00000022', buildId: '1100003228873C3B00000032', name: 'IdentityVerificationService.swift', path: 'PassGateIdentity/Services/IdentityVerificationService.swift', group: 'services' },
  { id: '1100002328873C3B00000023', buildId: '1100003328873C3B00000033', name: 'SimulatorMockProvider.swift', path: 'PassGateIdentity/Services/SimulatorMockProvider.swift', group: 'services' },
  { id: '1100002428873C3B00000024', buildId: '1100003428873C3B00000034', name: 'MdocParserService.swift', path: 'PassGateIdentity/Services/MdocParserService.swift', group: 'services' },
  { id: '1100002528873C3B00000025', buildId: '1100003528873C3B00000035', name: 'BackendAPIService.swift', path: 'PassGateIdentity/Services/BackendAPIService.swift', group: 'services' },
  { id: '1100002628873C3B00000026', buildId: '1100003628873C3B00000036', name: 'VerificationViewModel.swift', path: 'PassGateIdentity/ViewModels/VerificationViewModel.swift', group: 'viewModels' },
  { id: '1100002728873C3B00000027', buildId: '1100003728873C3B00000037', name: 'PKIdentityButtonView.swift', path: 'PassGateIdentity/Views/Components/PKIdentityButtonView.swift', group: 'components' },
  { id: '1100002828873C3B00000028', buildId: '1100003828873C3B00000038', name: 'StatusBadgeView.swift', path: 'PassGateIdentity/Views/Components/StatusBadgeView.swift', group: 'components' },
  { id: '1100002928873C3B00000029', buildId: '1100003928873C3B00000039', name: 'ClaimRowView.swift', path: 'PassGateIdentity/Views/Components/ClaimRowView.swift', group: 'components' },
  { id: '1100002A28873C3B0000002A', buildId: '1100003A28873C3B0000003A', name: 'ResultDetailView.swift', path: 'PassGateIdentity/Views/ResultDetailView.swift', group: 'views' },
  { id: '1100002B28873C3B0000002B', buildId: '1100003B28873C3B0000003B', name: 'SettingsSheetView.swift', path: 'PassGateIdentity/Views/SettingsSheetView.swift', group: 'views' },
  { id: '1100002C28873C3B0000002C', buildId: '1100003C28873C3B0000003C', name: 'VerificationView.swift', path: 'PassGateIdentity/Views/VerificationView.swift', group: 'views' },
  { id: '1100002D28873C3B0000002D', buildId: '1100003D28873C3B0000003D', name: 'ContentView.swift', path: 'PassGateIdentity/Views/ContentView.swift', group: 'views' },
];

const nonCodeFiles = [
  { id: '1100004028873C3B00000040', name: 'Info.plist', path: 'PassGateIdentity/Info.plist', group: 'app' },
  { id: '1100004128873C3B00000041', name: 'PassGateIdentity.entitlements', path: 'PassGateIdentity/PassGateIdentity.entitlements', group: 'app' },
];

let buildFilesStr = swiftFiles.map(f => `\t\t${f.buildId} /* ${f.name} in Sources */ = {isa = PBXBuildFile; fileRef = ${f.id} /* ${f.name} */; };`).join('\n');
buildFilesStr += `\n\t\t${pbx.passKitBuildFile} /* PassKit.framework in Frameworks */ = {isa = PBXBuildFile; fileRef = ${pbx.passKitFramework} /* PassKit.framework */; };`;

let fileRefsStr = swiftFiles.map(f => `\t\t${f.id} /* ${f.name} */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${path.basename(f.path)}; sourceTree = "<group>"; };`).join('\n');
fileRefsStr += `\n\t\t${nonCodeFiles[0].id} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };`;
fileRefsStr += `\n\t\t${nonCodeFiles[1].id} /* PassGateIdentity.entitlements */ = {isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = PassGateIdentity.entitlements; sourceTree = "<group>"; };`;
fileRefsStr += `\n\t\t${pbx.appProduct} /* PassGateIdentity.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = PassGateIdentity.app; sourceTree = BUILT_PRODUCTS_DIR; };`;
fileRefsStr += `\n\t\t${pbx.passKitFramework} /* PassKit.framework */ = {isa = PBXFileReference; lastKnownFileType = wrapper.framework; name = PassKit.framework; path = System/Library/Frameworks/PassKit.framework; sourceTree = SDKROOT; };`;

const appChildren = [
  ...swiftFiles.filter(f => f.group === 'app').map(f => f.id + ` /* ${f.name} */`),
  pbx.modelsGroup + ' /* Models */',
  pbx.servicesGroup + ' /* Services */',
  pbx.viewModelsGroup + ' /* ViewModels */',
  pbx.viewsGroup + ' /* Views */',
  nonCodeFiles[0].id + ' /* Info.plist */',
  nonCodeFiles[1].id + ' /* PassGateIdentity.entitlements */',
];

const modelsChildren = swiftFiles.filter(f => f.group === 'models').map(f => f.id + ` /* ${f.name} */`);
const servicesChildren = swiftFiles.filter(f => f.group === 'services').map(f => f.id + ` /* ${f.name} */`);
const viewModelsChildren = swiftFiles.filter(f => f.group === 'viewModels').map(f => f.id + ` /* ${f.name} */`);
const viewsChildren = [
  pbx.componentsGroup + ' /* Components */',
  ...swiftFiles.filter(f => f.group === 'views').map(f => f.id + ` /* ${f.name} */`),
];
const componentsChildren = swiftFiles.filter(f => f.group === 'components').map(f => f.id + ` /* ${f.name} */`);

const pbxprojContent = `// !$*UTF8*$!
{
\tarchiveVersion = 1;
\tclasses = {
\t};
\tobjectVersion = 56;
\tobjects = {

/* Begin PBXBuildFile section */
${buildFilesStr}
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
${fileRefsStr}
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
\t\t${pbx.frameworksBuildPhase} /* Frameworks */ = {
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t${pbx.passKitBuildFile} /* PassKit.framework in Frameworks */,
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
\t\t${pbx.mainGroup} = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${pbx.appGroup} /* PassGateIdentity */,
\t\t\t\t${pbx.passKitFramework} /* Frameworks */,
\t\t\t\t${pbx.productsGroup} /* Products */,
\t\t\t);
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${pbx.productsGroup} /* Products */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${pbx.appProduct} /* PassGateIdentity.app */,
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${pbx.appGroup} /* PassGateIdentity */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
${appChildren.map(c => `\t\t\t\t${c},`).join('\n')}
\t\t\t);
\t\t\tpath = PassGateIdentity;
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${pbx.modelsGroup} /* Models */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
${modelsChildren.map(c => `\t\t\t\t${c},`).join('\n')}
\t\t\t);
\t\t\tpath = Models;
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${pbx.servicesGroup} /* Services */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
${servicesChildren.map(c => `\t\t\t\t${c},`).join('\n')}
\t\t\t);
\t\t\tpath = Services;
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${pbx.viewModelsGroup} /* ViewModels */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
${viewModelsChildren.map(c => `\t\t\t\t${c},`).join('\n')}
\t\t\t);
\t\t\tpath = ViewModels;
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${pbx.viewsGroup} /* Views */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
${viewsChildren.map(c => `\t\t\t\t${c},`).join('\n')}
\t\t\t);
\t\t\tpath = Views;
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${pbx.componentsGroup} /* Components */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
${componentsChildren.map(c => `\t\t\t\t${c},`).join('\n')}
\t\t\t);
\t\t\tpath = Components;
\t\t\tsourceTree = "<group>";
\t\t};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
\t\t${pbx.nativeTarget} /* PassGateIdentity */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = ${pbx.targetConfigList} /* Build configuration list for PBXNativeTarget "PassGateIdentity" */;
\t\t\tbuildPhases = (
\t\t\t\t${pbx.sourcesBuildPhase} /* Sources */,
\t\t\t\t${pbx.frameworksBuildPhase} /* Frameworks */,
\t\t\t\t${pbx.resourcesBuildPhase} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = PassGateIdentity;
\t\t\tproductName = PassGateIdentity;
\t\t\tproductReference = ${pbx.appProduct} /* PassGateIdentity.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
\t\t${pbx.project} /* Project object */ = {
\t\t\tisa = PBXProject;
\t\t\tattributes = {
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 1500;
\t\t\t\tLastUpgradeCheck = 1500;
\t\t\t\tTargetAttributes = {
\t\t\t\t\t${pbx.nativeTarget} = {
\t\t\t\t\t\tCreatedOnToolsVersion = 15.0;
\t\t\t\t\t\tDevelopmentTeam = "";
\t\t\t\t\t\tSystemCapabilities = {
\t\t\t\t\t\t\tcom.apple.InAppIdentityPresentation = {
\t\t\t\t\t\t\t\tenabled = 1;
\t\t\t\t\t\t\t};
\t\t\t\t\t\t\tcom.apple.Wallet = {
\t\t\t\t\t\t\t\tenabled = 1;
\t\t\t\t\t\t\t};
\t\t\t\t\t\t};
\t\t\t\t\t};
\t\t\t\t};
\t\t\t};
\t\t\tbuildConfigurationList = ${pbx.projectConfigList} /* Build configuration list for PBXProject "PassGateIdentity" */;
\t\t\tcompatibilityVersion = "Xcode 14.0";
\t\t\tdevelopmentRegion = en;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\ten,
\t\t\t\tBase,
\t\t\t);
\t\t\tmainGroup = ${pbx.mainGroup};
\t\t\tproductRefGroup = ${pbx.productsGroup} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t${pbx.nativeTarget} /* PassGateIdentity */,
\t\t\t);
\t\t};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
\t\t${pbx.resourcesBuildPhase} /* Resources */ = {
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
\t\t${pbx.sourcesBuildPhase} /* Sources */ = {
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
${swiftFiles.map(f => `\t\t\t\t${f.buildId} /* ${f.name} in Sources */,`).join('\n')}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
\t\t${pbx.projectDebugConfig} /* Debug */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tCLANG_ANALYZER_NONNULL = YES;
\t\t\t\tCLANG_CXX_LANGUAGE_STANDARD = "gnu++20";
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;
\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
\t\t\t\tENABLE_TESTABILITY = YES;
\t\t\t\tGCC_DYNAMIC_NO_PIC = NO;
\t\t\t\tGCC_NO_COMMON_BLOCKS = YES;
\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;
\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (
\t\t\t\t\t"DEBUG=1",
\t\t\t\t\t"$(inherited)",
\t\t\t\t);
\t\t\t\tGCC_WARN_64_TO_32_BIT_CONVERSION = YES;
\t\t\t\tGCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
\t\t\t\tGCC_WARN_UNDECLARED_SELECTOR = YES;
\t\t\t\tGCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;
\t\t\t\tGCC_WARN_UNUSED_FUNCTION = YES;
\t\t\t\tGCC_WARN_UNUSED_VARIABLE = YES;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;
\t\t\t\tMTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
\t\t\t\tMTL_FAST_MATH = YES;
\t\t\t\tONLY_ACTIVE_ARCH = YES;
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-Onone";
\t\t\t};
\t\t\tname = Debug;
\t\t};
\t\t${pbx.projectReleaseConfig} /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tCLANG_ANALYZER_NONNULL = YES;
\t\t\t\tCLANG_CXX_LANGUAGE_STANDARD = "gnu++20";
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
\t\t\t\tENABLE_NS_ASSERTIONS = NO;
\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
\t\t\t\tGCC_NO_COMMON_BLOCKS = YES;
\t\t\t\tGCC_WARN_64_TO_32_BIT_CONVERSION = YES;
\t\t\t\tGCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
\t\t\t\tGCC_WARN_UNDECLARED_SELECTOR = YES;
\t\t\t\tGCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;
\t\t\t\tGCC_WARN_UNUSED_FUNCTION = YES;
\t\t\t\tGCC_WARN_UNUSED_VARIABLE = YES;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;
\t\t\t\tMTL_ENABLE_DEBUG_INFO = NO;
\t\t\t\tMTL_FAST_MATH = YES;
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSWIFT_COMPILATION_MODE = wholemodule;
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-O";
\t\t\t\tVALIDATE_PRODUCT = YES;
\t\t\t};
\t\t\tname = Release;
\t\t};
\t\t${pbx.targetDebugConfig} /* Debug */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
\t\t\t\tASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
\t\t\t\tCODE_SIGN_ENTITLEMENTS = PassGateIdentity/PassGateIdentity.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tDEVELOPMENT_ASSET_PATHS = "";
\t\t\t\tENABLE_PREVIEWS = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = PassGateIdentity/Info.plist;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.credence.passgate;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t};
\t\t\tname = Debug;
\t\t};
\t\t${pbx.targetReleaseConfig} /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
\t\t\t\tASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
\t\t\t\tCODE_SIGN_ENTITLEMENTS = PassGateIdentity/PassGateIdentity.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tDEVELOPMENT_ASSET_PATHS = "";
\t\t\t\tENABLE_PREVIEWS = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = PassGateIdentity/Info.plist;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.credence.passgate;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t};
\t\t\tname = Release;
\t\t};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
\t\t${pbx.projectConfigList} /* Build configuration list for PBXProject "PassGateIdentity" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${pbx.projectDebugConfig} /* Debug */,
\t\t\t\t${pbx.projectReleaseConfig} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
\t\t${pbx.targetConfigList} /* Build configuration list for PBXNativeTarget "PassGateIdentity" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${pbx.targetDebugConfig} /* Debug */,
\t\t\t\t${pbx.targetReleaseConfig} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
/* End XCConfigurationList section */

\t};
\trootObject = ${pbx.project} /* Project object */;
}
`;

fs.writeFileSync(path.join(xcodeProjDir, 'project.pbxproj'), pbxprojContent, 'utf8');
console.log('Successfully generated PassGateIdentity.xcodeproj/project.pbxproj');
