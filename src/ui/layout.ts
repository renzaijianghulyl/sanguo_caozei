export interface UIRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UILayout {
  attributePanel: UIRect;
  dialogueArea: UIRect;
  inputArea: UIRect;
  saveLoadPanel: UIRect;
}

export function createUILayout(screenWidth: number, screenHeight: number): UILayout {
  const attributePanel: UIRect = {
    x: 0,
    y: 0,
    width: screenWidth,
    height: 80
  };

  const inputAreaHeight = Math.max(100, Math.round(screenHeight * 0.2));
  const saveLoadPanelHeight = 60;

  const inputArea: UIRect = {
    x: 0,
    y: screenHeight - inputAreaHeight,
    width: screenWidth,
    height: inputAreaHeight
  };

  const saveLoadPanel: UIRect = {
    x: 0,
    y: inputArea.y - saveLoadPanelHeight,
    width: screenWidth,
    height: saveLoadPanelHeight
  };

  const dialogueArea: UIRect = {
    x: 0,
    y: attributePanel.height,
    width: screenWidth,
    height: saveLoadPanel.y - attributePanel.height
  };

  return {
    attributePanel,
    dialogueArea,
    inputArea,
    saveLoadPanel
  };
}
