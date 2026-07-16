; Inno Setup Script for RocketDL Download Manager
; Setup file to package the compiled standalone RocketDL.exe into a Windows Installer.

#define MyAppName "RocketDL"
#define MyAppVersion "1.0"
#define MyAppPublisher "Jeel Pandya"
#define MyAppExeName "RocketDL.exe"
#define MyIconPath "D:\OCTO\Download_Manager\RocketDL.ico"

[Setup]
; Basic Application Info
AppId={{D37F8F7C-906D-45BD-8B5C-F7F139C6B1B2}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes

; Output Configuration
OutputDir=D:\OCTO\Download_Manager\dist
OutputBaseFilename=RocketDL_Setup
SetupIconFile={#MyIconPath}
UninstallDisplayIcon={app}\RocketDL.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

; Platform requirements (Optional: 64-bit windows only if the EXE is 64-bit)
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Source path points to the compiled exe in dist directory
Source: "D:\OCTO\Download_Manager\dist\RocketDL.exe"; DestDir: "{app}"; Flags: ignoreversion
; Include the icon for shortcut use if needed
Source: "{#MyIconPath}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Start Menu Shortcut
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\RocketDL.ico"
; Desktop Shortcut (tied to the task checkbox)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\RocketDL.ico"

[Run]
; Auto-launch after installation
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
