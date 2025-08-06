import type { Logger } from "@clipboard-health/util-ts";

import { Analytics, type Enabled, type IdentifyRequest, type TrackRequest } from "./analytics";

const mockSegment = {
  identify: jest.fn(),
  track: jest.fn(),
};

jest.mock("@segment/analytics-node", () => ({
  Analytics: jest.fn(() => mockSegment),
}));

describe("Analytics", () => {
  let logger: Logger;
  let analytics: Analytics;

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create an Analytics instance", () => {
      const enabled: Enabled = { identify: true, track: true };
      analytics = new Analytics({ apiKey: "test-key", logger, enabled });
      expect(analytics).toBeInstanceOf(Analytics);
    });
  });

  describe("identify", () => {
    it("should call segment identify when enabled", () => {
      const enabled: Enabled = { identify: true, track: true };
      analytics = new Analytics({ apiKey: "test-key", logger, enabled });

      const request: IdentifyRequest = {
        userId: "user123",
        traits: { email: "test@example.com", name: "Test User" },
      };

      analytics.identify(request);

      expect(mockSegment.identify).toHaveBeenCalledWith({
        userId: "user123",
        traits: { email: "test@example.com", name: "Test User" },
      });
    });

    it("should not call segment identify when disabled", () => {
      const enabled: Enabled = { identify: false, track: true };
      analytics = new Analytics({ apiKey: "test-key", logger, enabled });

      const request: IdentifyRequest = {
        userId: "user123",
        traits: { email: "test@example.com" },
      };

      analytics.identify(request);

      expect(mockSegment.identify).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("analytics.identify: disabled, skipping", {
        destination: "segment.identify",
        traceName: "analytics.identify",
        userId: "user123",
        params: request,
      });
    });

    it("should normalize phone numbers to E.164 format", () => {
      const enabled: Enabled = { identify: true, track: true };
      analytics = new Analytics({ apiKey: "test-key", logger, enabled });

      const request: IdentifyRequest = {
        userId: "user123",
        traits: { phone: "+1 (555) 123-4567" },
      };

      analytics.identify(request);

      expect(mockSegment.identify).toHaveBeenCalledWith({
        userId: "user123",
        traits: { phone: "+15551234567" },
      });
    });

    it("should handle invalid phone numbers", () => {
      const enabled: Enabled = { identify: true, track: true };
      analytics = new Analytics({ apiKey: "test-key", logger, enabled });

      const request: IdentifyRequest = {
        userId: "user123",
        traits: { phone: "invalid-phone" },
      };

      analytics.identify(request);

      expect(logger.error).toHaveBeenCalled();
      expect(mockSegment.identify).toHaveBeenCalledWith({
        userId: "user123",
        traits: { phone: "invalid-phone" },
      });
    });

    it("should convert userId to string", () => {
      const enabled: Enabled = { identify: true, track: true };
      analytics = new Analytics({ apiKey: "test-key", logger, enabled });

      const request: IdentifyRequest = {
        userId: 123,
        traits: { email: "test@example.com" },
      };

      analytics.identify(request);

      expect(mockSegment.identify).toHaveBeenCalledWith({
        userId: "123",
        traits: { email: "test@example.com" },
      });
    });

    it("should handle segment identify errors", () => {
      const enabled: Enabled = { identify: true, track: true };
      analytics = new Analytics({ apiKey: "test-key", logger, enabled });

      const request: IdentifyRequest = {
        userId: "user123",
        traits: { email: "test@example.com" },
      };

      const error = new Error("Segment API error");
      mockSegment.identify.mockImplementationOnce(() => {
        throw error;
      });

      analytics.identify(request);

      expect(logger.error).toHaveBeenCalledWith("analytics.identify", {
        destination: "segment.identify",
        traceName: "analytics.identify",
        userId: "user123",
        ...error,
      });
    });
  });

  describe("track", () => {
    it("should call segment track when enabled", () => {
      const enabled: Enabled = { identify: true, track: true };
      analytics = new Analytics({ apiKey: "test-key", logger, enabled });

      const request: TrackRequest = {
        userId: "user123",
        event: "Button Clicked",
        traits: { buttonName: "Submit" },
      };

      analytics.track(request);

      expect(mockSegment.track).toHaveBeenCalledWith({
        userId: "user123",
        event: "Button Clicked",
        properties: { buttonName: "Submit" },
      });
    });

    it("should not call segment track when disabled", () => {
      const enabled: Enabled = { identify: true, track: false };
      analytics = new Analytics({ apiKey: "test-key", logger, enabled });

      const request: TrackRequest = {
        userId: "user123",
        event: "Button Clicked",
        traits: { buttonName: "Submit" },
      };

      analytics.track(request);

      expect(mockSegment.track).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("analytics.track: disabled, skipping", {
        destination: "segment.track",
        traceName: "analytics.track",
        userId: "user123",
        params: request,
      });
    });

    it("should convert userId to string", () => {
      const enabled: Enabled = { identify: true, track: true };
      analytics = new Analytics({ apiKey: "test-key", logger, enabled });

      const request: TrackRequest = {
        userId: 456,
        event: "Page View",
        traits: { page: "home" },
      };

      analytics.track(request);

      expect(mockSegment.track).toHaveBeenCalledWith({
        userId: "456",
        event: "Page View",
        properties: { page: "home" },
      });
    });

    it("should handle segment track errors", () => {
      const enabled: Enabled = { identify: true, track: true };
      analytics = new Analytics({ apiKey: "test-key", logger, enabled });

      const request: TrackRequest = {
        userId: "user123",
        event: "Button Clicked",
        traits: { buttonName: "Submit" },
      };

      const error = new Error("Segment track error");
      mockSegment.track.mockImplementationOnce(() => {
        throw error;
      });

      analytics.track(request);

      expect(logger.error).toHaveBeenCalledWith("analytics.track", {
        destination: "segment.track",
        traceName: "analytics.track",
        userId: "user123",
        ...error,
      });
    });
  });
});
