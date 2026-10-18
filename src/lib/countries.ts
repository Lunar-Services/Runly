import countryData from "flag-icons/country.json";

export const countries = countryData
  .filter((country) => country.iso)
  .map(({ code, name }) => ({ code: code.toUpperCase(), name }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

export function getCountry(code: string) {
  return countries.find((country) => country.code === code);
}

export function legacyCountryCode(region: string) {
  const knownRegions: Record<string, string> = {
    frankfurt: "DE",
    virginia: "US",
    sydney: "AU",
  };
  return (
    knownRegions[region.toLowerCase()] ||
    countries.find(
      (country) => country.name.toLowerCase() === region.toLowerCase(),
    )?.code ||
    ""
  );
}
