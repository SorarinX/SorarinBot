; SorarinBot NSIS payload customisations (SA-2).
;
; Included by electron-builder for both the installer and the uninstaller.
; Contract: installer/CONTRACT.md sections 7 and 8.
;
; Install:   payload.exe /S  with SORARINBOT_INSTALL_DIR set to the target dir.
; Uninstall: Uninstall SorarinBot.exe /S  (user data must survive).

!ifndef SORARINBOT_NSH_INCLUDED
!define SORARINBOT_NSH_INCLUDED

!include "LogicLib.nsh"
!include "FileFunc.nsh"

; Set to "1" only when the uninstaller is asked to delete app data.
; Only the uninstaller build uses this variable; declaring it in the installer
; would make makensis warn 6001 (unused variable), and -WX turns that into an
; error.
!ifdef BUILD_UNINSTALLER
  Var SorarinBotDeleteData
!endif

; ---------------------------------------------------------------------------
; Shared helpers
; ---------------------------------------------------------------------------

; Close the desktop app and its Go backend. Both processes are named
; SorarinBot.exe, so a single taskkill /IM covers the Electron tree.
!macro SorarinBotCloseApp
  DetailPrint "Closing running SorarinBot.exe instances..."
  nsExec::Exec '"$SYSDIR\taskkill.exe" /IM SorarinBot.exe'
  Pop $0
  Sleep 1000
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM SorarinBot.exe'
  Pop $0
  Sleep 500
!macroend


; Copy one preserved user file to the per-user preservation directory.
!macro SorarinBotBackupOne _FILE
  ${If} ${FileExists} "$INSTDIR\resources\${_FILE}"
    CopyFiles /SILENT "$INSTDIR\resources\${_FILE}" "$LOCALAPPDATA\SorarinBot\user-data\${_FILE}"
  ${EndIf}
!macroend

; Restore one preserved user file when the new install does not have it.
!macro SorarinBotRestoreOne _FILE
  ${If} ${FileExists} "$LOCALAPPDATA\SorarinBot\user-data\${_FILE}"
  ${AndIfNot} ${FileExists} "$INSTDIR\resources\${_FILE}"
    CreateDirectory "$INSTDIR\resources"
    CopyFiles /SILENT "$LOCALAPPDATA\SorarinBot\user-data\${_FILE}" "$INSTDIR\resources\${_FILE}"
  ${EndIf}
!macroend

; electron-builder creates the shortcuts itself; recreate any that are
; missing so the payload contract holds after a keep-shortcuts upgrade.
!macro SorarinBotEnsureShortcuts
  ${IfNot} ${FileExists} "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$INSTDIR\SorarinBot.exe" "" "$INSTDIR\SorarinBot.exe" 0 SW_SHOWNORMAL
    WinShell::SetLnkAUMI "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${EndIf}
  ${IfNot} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\SorarinBot.exe" "" "$INSTDIR\SorarinBot.exe" 0 SW_SHOWNORMAL
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${EndIf}
!macroend

; Write install.ok with the JSON shape frozen in CONTRACT.md section 7.
!macro SorarinBotWriteInstallOk
  ${GetTime} "" "LS" $0 $1 $2 $3 $4 $5 $6
  IntFmt $0 "%02d" $0
  IntFmt $1 "%02d" $1
  IntFmt $4 "%02d" $4
  IntFmt $5 "%02d" $5
  IntFmt $6 "%02d" $6
  StrCpy $R8 "$2-$1-$0T$4:$5:$6Z"
  FileOpen $R7 "$INSTDIR\install.ok" w
  FileWrite $R7 '{"version":"${VERSION}","installedAt":"$R8"}'
  FileClose $R7
!macroend

; ---------------------------------------------------------------------------
; electron-builder hooks
; ---------------------------------------------------------------------------

; Runs at the end of .onInit, after the default $INSTDIR has been selected and
; before any file is extracted.
!macro customInit
  StrCpy $R1 "$INSTDIR"
  ReadEnvStr $R0 "SORARINBOT_INSTALL_DIR"
  ${If} $R0 != ""
    StrCpy $INSTDIR $R0
    ; Drop a trailing backslash ("C:\Dir\" -> "C:\Dir"), keep "C:\".
    StrCpy $R0 "$INSTDIR" 1 -1
    ${If} $R0 == "\"
      StrLen $R2 "$INSTDIR"
      ${If} $R2 > 3
        StrCpy $INSTDIR "$INSTDIR" -1
      ${EndIf}
    ${EndIf}
    DetailPrint "SORARINBOT_INSTALL_DIR override: $INSTDIR"
    ; .onInit created the default directory before this hook ran; remove it
    ; only if it is empty and is not the directory we are about to use.
    ${If} $R1 != ""
    ${AndIf} $R1 != $INSTDIR
      RMDir "$R1"
    ${EndIf}
  ${EndIf}
  ; A silent install must not fail because the app is holding its own files.
  ${If} ${Silent}
    !insertmacro SorarinBotCloseApp
  ${EndIf}
!macroend

; Runs after electron-builder has extracted the app and created shortcuts.
!macro customInstall
  !insertmacro SorarinBotCloseApp
  !insertmacro SorarinBotRestoreOne data.db
  !insertmacro SorarinBotRestoreOne token.json
  !insertmacro SorarinBotRestoreOne config.yaml
  !insertmacro SorarinBotEnsureShortcuts
  !insertmacro SorarinBotWriteInstallOk
!macroend

; Runs at the start of the uninstall section, before electron-builder removes
; $INSTDIR. Copy user data to a per-user location it cannot delete.
!macro customUnInstall
  StrCpy $SorarinBotDeleteData "0"
  ${GetParameters} $R0
  ${GetOptions} $R0 "--delete-app-data" $R1
  ${IfNot} ${Errors}
    StrCpy $SorarinBotDeleteData "1"
  ${EndIf}
  ${If} $SorarinBotDeleteData == "1"
    RMDir /r "$LOCALAPPDATA\SorarinBot\user-data"
  ${Else}
    CreateDirectory "$LOCALAPPDATA\SorarinBot\user-data"
    !insertmacro SorarinBotBackupOne data.db
    !insertmacro SorarinBotBackupOne token.json
    !insertmacro SorarinBotBackupOne config.yaml
  ${EndIf}
!macroend

!endif ; SORARINBOT_NSH_INCLUDED
