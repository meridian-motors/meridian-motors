"use client";
import { Button } from "@/components/ui/button";

export function CookieSettingsButton() {
  return <Button variant="secondary" onClick={() => window.dispatchEvent(new Event("mm:cookie-settings"))}>Change cookie settings</Button>;
}
