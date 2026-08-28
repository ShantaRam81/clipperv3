export const state = {
  sourceDuration: 30,
  selectedSourceUrl: "",
  selectedPreviewUrl: "",
  selectedPreviewKind: "",
  selectedMediaType: "video",
  probeTimer: 0,
  probeToken: 0,
  activeDrag: null,
  currentFilmstripUrl: "",
  configuredTags: ["Motion", "Transition", "Animate", "Flow", "Particles", "Background", "Scenario"],
  selectedTags: [],
  savedTags: [],
  showingAllOptions: false,
  currentOptions: [],
  isSaving: false,
  hlsPlayer: null,
  uiState: "idle"
};

export const isTouchInput = window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
export const prefersNativePaste = isTouchInput
  || navigator.userAgentData?.mobile === true
  || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
