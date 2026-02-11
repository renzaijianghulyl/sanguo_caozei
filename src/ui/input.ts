export interface InputState {
  value: string;
  isKeyboardVisible: boolean;
}

export function createInputState(): InputState {
  return {
    value: "",
    isKeyboardVisible: false
  };
}

export function setInputValue(state: InputState, value: string): InputState {
  state.value = value;
  return state;
}

export function clearInput(state: InputState): InputState {
  state.value = "";
  return state;
}

export function setKeyboardVisible(state: InputState, visible: boolean): InputState {
  state.isKeyboardVisible = visible;
  return state;
}
