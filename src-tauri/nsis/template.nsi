; Tauri NSIS installer template - customized for 时间管理工具
; This is a Handlebars template processed by Tauri CLI

!include "MUI2.nsh"
!include "FileFunc.nsh"

; ----- Handlebars variables (set by Tauri) -----
!define PRODUCT_NAME "{{product_name}}"
!define PRODUCT_VERSION "{{product_version}}"
!define APP_EXE "{{app_exe}}"

; ----- Custom definitions -----
!define PRODUCT_DISPLAY_NAME "时间管理工具"
!define PRODUCT_DIR "E:\时间管理工具"
!define SETUP_EXE "时间管理工具_Setup.exe"

Name "${PRODUCT_DISPLAY_NAME}"
OutFile "nsis-output.exe"
InstallDir "${PRODUCT_DIR}"

; Request application privileges
RequestExecutionLevel admin

; ----- Interface settings -----
!define MUI_ABORTWARNING
!define MUI_ICON "{{icon_path}}"
!define MUI_UNICON "{{icon_path}}"
!define MUI_WELCOMEPAGE_TITLE "${PRODUCT_DISPLAY_NAME} 安装向导"
!define MUI_WELCOMEPAGE_TEXT "欢迎使用 ${PRODUCT_DISPLAY_NAME} 安装向导。$\r$\n$\r$\n本向导将引导您完成安装过程。$\r$\n$\r$\n点击"下一步"继续。"
!define MUI_FINISHPAGE_TITLE "安装完成"
!define MUI_FINISHPAGE_TEXT "${PRODUCT_DISPLAY_NAME} 已成功安装到您的电脑。$\r$\n$\r$\n点击"完成"关闭安装向导。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "运行 ${PRODUCT_DISPLAY_NAME}"
!define MUI_LANGDLL_ALLLANGUAGES

; ----- Pages -----
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; ----- Language -----
!insertmacro MUI_LANGUAGE "SimpChinese"

; ----- Install section -----
Section "Install" SEC_INSTALL
  SetOutPath "$INSTDIR"

  ; Close running app if any
  ; Skip killing process - handled by Tauri

  ; Delete existing files first
  RMDir /r "$INSTDIR\*.*"
  RMDir "$INSTDIR"

  SetOutPath "$INSTDIR"

  ; Copy app files (Tauri handles resource bundling)
  SetOverwrite on

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Registry for Add/Remove Programs
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_DISPLAY_NAME}" \
    "DisplayName" "${PRODUCT_DISPLAY_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_DISPLAY_NAME}" \
    "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_DISPLAY_NAME}" \
    "Publisher" ""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_DISPLAY_NAME}" \
    "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_DISPLAY_NAME}" \
    "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_DISPLAY_NAME}" \
    "NoRepair" 1

  ; Shortcuts
  CreateDirectory "$SMPROGRAMS\${PRODUCT_DISPLAY_NAME}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_DISPLAY_NAME}\${PRODUCT_DISPLAY_NAME}.lnk" \
    "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut "$DESKTOP\${PRODUCT_DISPLAY_NAME}.lnk" \
    "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0

  ; Estimate size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_DISPLAY_NAME}" \
    "EstimatedSize" "$0"
SectionEnd

; ----- Uninstall section -----
Section "Uninstall"
  ; Kill running process
  ; Skip killing process - handled by Tauri

  ; Remove shortcuts
  Delete "$SMPROGRAMS\${PRODUCT_DISPLAY_NAME}\${PRODUCT_DISPLAY_NAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_DISPLAY_NAME}"
  Delete "$DESKTOP\${PRODUCT_DISPLAY_NAME}.lnk"

  ; Remove app files
  RMDir /r "$INSTDIR\*.*"
  RMDir "$INSTDIR"

  ; Remove registry keys
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_DISPLAY_NAME}"
SectionEnd