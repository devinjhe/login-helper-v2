import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginTypeSelect } from "@/entrypoints/popup/LoginTypeSelect";
import { LOGIN_TYPES } from "@/lib/loginTypes";

describe("LoginTypeSelect", () => {
  it("shows the placeholder when no value is selected", () => {
    render(<LoginTypeSelect value="" onChange={vi.fn()} ariaLabel="Login type" />);
    expect(screen.getByRole("combobox", { name: /login type/i })).toHaveTextContent(
      /select a login type/i,
    );
  });

  it("renders every predefined option (including Other) when opened", async () => {
    render(<LoginTypeSelect value="" onChange={vi.fn()} ariaLabel="Login type" />);

    await userEvent.click(screen.getByRole("combobox", { name: /login type/i }));

    for (const type of LOGIN_TYPES) {
      expect(screen.getByRole("option", { name: type })).toBeInTheDocument();
    }
    expect(screen.getByRole("option", { name: "Other" })).toBeInTheDocument();
  });

  it("calls onChange with the chosen value", async () => {
    const onChange = vi.fn();
    render(<LoginTypeSelect value="" onChange={onChange} ariaLabel="Login type" />);

    await userEvent.click(screen.getByRole("combobox", { name: /login type/i }));
    await userEvent.click(screen.getByRole("option", { name: "Email" }));

    expect(onChange).toHaveBeenCalledWith("Email");
  });

  it("shows the current selection on the trigger", () => {
    render(<LoginTypeSelect value="SSO" onChange={vi.fn()} ariaLabel="Login type" />);
    expect(screen.getByRole("combobox", { name: /login type/i })).toHaveTextContent("SSO");
  });

  it("injects a legacy value outside the predefined list as a selectable option", async () => {
    // An older entry might hold an arbitrary loginType; editing it must not drop
    // or silently rewrite the stored value.
    render(<LoginTypeSelect value="Okta" onChange={vi.fn()} ariaLabel="Login type" />);

    expect(screen.getByRole("combobox", { name: /login type/i })).toHaveTextContent("Okta");
    await userEvent.click(screen.getByRole("combobox", { name: /login type/i }));
    expect(screen.getByRole("option", { name: "Okta" })).toBeInTheDocument();
  });
});
