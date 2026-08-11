export interface RandomPhoneNumberOptions {
  /** Whether to include the US country code in the number. */
  international?: boolean;
}

const VALID_TEST_PHONE_AREA_CODES = [
  "201",
  "202",
  "203",
  "205",
  "206",
  "207",
  "208",
  "209",
  "210",
  "212",
  "213",
  "214",
  "215",
  "216",
  "217",
  "218",
  "219",
  "220",
  "223",
  "224",
  "225",
  "227",
  "228",
  "229",
  "231",
  "234",
  "235",
  "239",
  "240",
  "248",
  "251",
  "252",
  "253",
  "254",
  "256",
  "260",
  "262",
  "267",
  "269",
  "270",
  "272",
  "276",
  "279",
  "281",
  "283",
  "301",
  "302",
  "303",
  "304",
  "305",
  "307",
  "308",
  "309",
  "310",
  "312",
  "313",
  "314",
  "315",
  "316",
  "317",
  "318",
  "319",
  "320",
  "321",
  "323",
  "324",
  "325",
  "326",
  "327",
  "329",
  "330",
  "331",
  "332",
  "334",
  "336",
  "337",
  "339",
  "341",
  "346",
  "347",
  "350",
  "351",
  "352",
  "353",
  "360",
  "361",
  "363",
  "364",
  "369",
  "380",
  "385",
  "386",
  "401",
  "402",
  "404",
  "405",
  "406",
  "407",
  "408",
  "409",
  "410",
  "412",
  "413",
  "414",
  "415",
  "417",
  "419",
  "423",
  "424",
  "425",
  "430",
  "432",
  "434",
  "435",
  "440",
  "442",
  "443",
  "445",
  "447",
  "448",
  "458",
  "463",
  "464",
  "469",
  "470",
  "475",
] as const;

const MINIMUM_SUBSCRIBER_NUMBER = 2_000_000;
const MAXIMUM_SUBSCRIBER_NUMBER = 9_999_999;

/**
 * Creates a random US phone number accepted by pinned libphonenumber-js metadata.
 *
 * The 126 area codes × 8,000,000 full-width subscriber numbers provide
 * 1,008,000,000 possible values. These are not reserved NANP test numbers;
 * callers creating synthetic identities must suppress outbound routing.
 */
export function randomPhoneNumber(options: RandomPhoneNumberOptions = {}): string {
  const { international = false } = options;
  const prefix = international ? "+1" : "";
  const areaCode = randomAreaCode();
  const subscriberNumber = randomInteger({
    minimum: MINIMUM_SUBSCRIBER_NUMBER,
    maximum: MAXIMUM_SUBSCRIBER_NUMBER,
  });

  return `${prefix}${areaCode}${subscriberNumber}`;
}

interface RandomIntegerParams {
  minimum: number;
  maximum: number;
}

function randomInteger({ minimum, maximum }: RandomIntegerParams): number {
  const minimumInteger = Math.ceil(minimum);
  const maximumInteger = Math.floor(maximum);

  return Math.floor(Math.random() * (maximumInteger - minimumInteger + 1)) + minimumInteger;
}

function randomAreaCode(): string {
  const index = randomInteger({ minimum: 0, maximum: VALID_TEST_PHONE_AREA_CODES.length - 1 });

  return VALID_TEST_PHONE_AREA_CODES.slice(index, index + 1).join("");
}
