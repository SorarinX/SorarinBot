; SorarinBot NSIS Installer

!include "MUI2.nsh"
!include "FileFunc.nsh"

Name "SorarinBot"
OutFile "SorarinBot-v1.0.0-win64-Setup.exe"
InstallDir "$PROGRAMFILES\SorarinBot"
InstallDirRegKey HKLM "Software\SorarinBot" "InstallDir"
RequestExecutionLevel admin
Unicode True

VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "SorarinBot"
VIAddVersionKey "CompanyName" "Sorarin"
VIAddVersionKey "FileDescription" "WeChat AI Assistant"
VIAddVersionKey "FileVersion" "1.0.0"
VIAddVersionKey "ProductVersion" "1.0.0"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"

!define MUI_WELCOMEPAGE_TITLE "Welcome to SorarinBot Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will install SorarinBot on your computer.$\r$\n$\r$\nSorarinBot is a WeChat AI assistant with multi-model support.$\r$\n$\r$\nClick Next to continue."

!define MUI_FINISHPAGE_RUN "$INSTDIR\SorarinBot.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch SorarinBot"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "license.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "SorarinBot (Required)" SecCore
  SectionIn RO
  SetOutPath "$INSTDIR"
  File "SorarinBot.exe"
  File "config.yaml"

  CreateDirectory "$APPDATA\SorarinBot"
  IfFileExists "$APPDATA\SorarinBot\config.yaml" cfg_ok
    CopyFiles "$INSTDIR\config.yaml" "$APPDATA\SorarinBot\config.yaml"
  cfg_ok:

  WriteRegStr HKLM "Software\SorarinBot" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SorarinBot" "DisplayName" "SorarinBot"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SorarinBot" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SorarinBot" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SorarinBot" "DisplayIcon" "$INSTDIR\SorarinBot.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SorarinBot" "Publisher" "Sorarin"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SorarinBot" "DisplayVersion" "1.0.0"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SorarinBot" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SorarinBot" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SorarinBot" "EstimatedSize" "$0"

  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Desktop Shortcut" SecDesktop
  CreateShortcut "$DESKTOP\SorarinBot.lnk" "$INSTDIR\SorarinBot.exe"
SectionEnd

Section "Start Menu" SecStartMenu
  CreateDirectory "$SMPROGRAMS\SorarinBot"
  CreateShortcut "$SMPROGRAMS\SorarinBot\SorarinBot.lnk" "$INSTDIR\SorarinBot.exe"
  CreateShortcut "$SMPROGRAMS\SorarinBot\Uninstall.lnk" "$INSTDIR\uninstall.exe"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecCore} "Install SorarinBot core files."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Create a desktop shortcut."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStartMenu} "Create Start Menu shortcuts."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  Delete "$INSTDIR\SorarinBot.exe"
  Delete "$INSTDIR\config.yaml"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$DESKTOP\SorarinBot.lnk"
  Delete "$SMPROGRAMS\SorarinBot\SorarinBot.lnk"
  Delete "$SMPROGRAMS\SorarinBot\Uninstall.lnk"
  RMDir "$SMPROGRAMS\SorarinBot"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SorarinBot"
  DeleteRegKey HKLM "Software\SorarinBot"
SectionEnd
