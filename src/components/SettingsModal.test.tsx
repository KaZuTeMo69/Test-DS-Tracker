// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SettingsModal from "./SettingsModal";
import { DEFAULT_SETTINGS } from "../lib/settings";

afterEach(cleanup);

const open = (overrides: { isOpen?: boolean } = {}) => {
  const props = {
    isOpen: true,
    settings: DEFAULT_SETTINGS,
    onChange: vi.fn(),
    onClose: vi.fn(),
    orsKey: "",
    onOrsKey: vi.fn(),
    potentialsTab: "none" as const,
    onDownloadTemplate: vi.fn(),
    ...overrides,
  };
  render(<SettingsModal {...props} />);
  return props;
};

describe("the Settings window", () => {
  it("is a dialog named Settings, and isn't there when closed", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    cleanup();
    open({ isOpen: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saves a renewal lead time typed as a whole number; marks anything else and doesn't save it", () => {
    const { onChange } = open();
    const field = screen.getByLabelText("Days before the contract ends");
    fireEvent.change(field, { target: { value: "45" } });
    expect(onChange).toHaveBeenLastCalledWith({ leadDays: 45 });
    onChange.mockClear();
    fireEvent.change(field, { target: { value: "4.5" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(field.getAttribute("aria-invalid")).toBe("true");
  });

  it("turns VAT on with its switch", () => {
    const { onChange } = open();
    fireEvent.click(screen.getByRole("switch", { name: /Show rent including VAT/ }));
    expect(onChange).toHaveBeenCalledWith({ includeVat: true });
  });

  it("closes with Esc, the Close button, or a click beside it, but not a click inside", () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByTitle("Close"));
    const beside = document.querySelector('[data-modal] > [aria-hidden="true"]');
    expect(beside).not.toBeNull();
    fireEvent.click(beside!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
