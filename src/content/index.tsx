import React from "react";
import { createRoot } from "react-dom/client";

import { OverlayApp } from "./OverlayApp";
import { ImageGrabber } from "./ImageGrabber";
import { GRAB_STORAGE_KEYS } from "../lib/grab-library";
import { storageSet } from "../lib/storage";
import contentStyles from "../styles/tailwind.css?inline";

const CONTAINER_ID = "prompt-butler-root";
const GRAB_CONTAINER_ID = "prompt-butler-grabber-root";
const STYLE_ELEMENT_ID = "prompt-butler-style";

function ensureShadowStyles(shadowRoot: ShadowRoot) {
  if (shadowRoot.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = contentStyles;
  shadowRoot.appendChild(style);
}

function mount(containerId: string, app: React.ReactNode) {
  const existingContainer = document.getElementById(containerId);

  if (existingContainer) {
    existingContainer.style.display = "block";
    return existingContainer;
  }

  const container = document.createElement("div");
  container.id = containerId;
  const shadowRoot = container.attachShadow({ mode: "open" });
  const appRoot = document.createElement("div");
  document.body.appendChild(container);
  ensureShadowStyles(shadowRoot);
  shadowRoot.appendChild(appRoot);

  createRoot(appRoot).render(
    <React.StrictMode>{app}</React.StrictMode>
  );

  return container;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "overlay:open") {
    mount(CONTAINER_ID, <OverlayApp />);

    if (message.focus === "grab") {
      void storageSet(GRAB_STORAGE_KEYS.focus, new Date().toISOString());
    }

    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// 抓图悬停检测始终挂载
mount(GRAB_CONTAINER_ID, <ImageGrabber />);
