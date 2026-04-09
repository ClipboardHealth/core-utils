import { type UserSetPreferencesParams } from "@knocklabs/node/resources/index";

import { type UpsertUserPreferencesRequest } from "../types";
import { toKnockUserPreferences } from "./toKnockUserPreferences";

describe("toKnockPreferences", () => {
  it("maps upsert user preferences request to Knock user preference set", () => {
    const request: UpsertUserPreferencesRequest = {
      userId: "test",
      channelTypes: {
        chat: false,
        email: false,
        http: false,
        inAppFeed: false,
        push: false,
        sms: true,
      },
      channels: {
        "3cdc53dc-d33f-4e2d-a6ff-e17f9fcd5393": true,
        "bbb823cb-40c1-45d5-8934-68076d49f2f0": false,
      },
      categories: {
        "category-1": false,
        "category-2": {
          channelTypes: {
            sms: true,
          },
        },
      },
      workflows: {
        "workflow-1": true,
        "workflow-2": {
          channels: {
            "5be73d9d-f647-4f24-97af-730a74faf4bf": false,
          },
        },
      },
      commercialSubscribed: true,
    };

    const preferencesSet: UserSetPreferencesParams = toKnockUserPreferences(request);

    expect(preferencesSet).toEqual({
      channel_types: {
        chat: false,
        email: false,
        http: false,
        in_app_feed: false,
        push: false,
        sms: true,
      },
      channels: {
        "3cdc53dc-d33f-4e2d-a6ff-e17f9fcd5393": true,
        "bbb823cb-40c1-45d5-8934-68076d49f2f0": false,
      },
      categories: {
        "category-1": false,
        "category-2": {
          channel_types: {
            sms: true,
          },
        },
      },
      workflows: {
        "workflow-1": true,
        "workflow-2": {
          channels: {
            "5be73d9d-f647-4f24-97af-730a74faf4bf": false,
          },
        },
      },
      commercial_subscribed: true,
    });
  });

  it("allows clearing preferences", () => {
    const request: UpsertUserPreferencesRequest = {
      userId: "test",
      channelTypes: {},
      categories: null,
      workflows: {
        "workflow-1": {
          channelTypes: null,
        },
      },
    };

    const preferencesSet: UserSetPreferencesParams = toKnockUserPreferences(request);

    expect(preferencesSet).toEqual({
      channel_types: {},
      categories: null,
      workflows: {
        "workflow-1": {
          channel_types: null,
        },
      },
    });
  });

  it("allows resetting preferences", () => {
    const request: UpsertUserPreferencesRequest = {
      userId: "test",
    };

    const preferencesSet: UserSetPreferencesParams = toKnockUserPreferences(request);

    expect(preferencesSet).toEqual({});
  });
});
