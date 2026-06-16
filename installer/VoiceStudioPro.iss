#define AppName "VoiceStudio Pro"
#define AppPublisher "VoiceStudio Pro"
#define AppExeName "VoiceStudioPro.exe"

#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif

#ifndef ReleaseDir
  #define ReleaseDir "..\\dist\\release"
#endif

#ifndef OutputBaseFilename
  #define OutputBaseFilename "VoiceStudioPro-" + AppVersion + "-setup"
#endif

[Setup]
AppId={{A58D0F33-9C7F-4205-BE67-BB32C8418364}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}
OutputDir={#ReleaseDir}
OutputBaseFilename={#OutputBaseFilename}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; Flags: unchecked

[Files]
Source: "..\dist\VoiceStudioPro\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
