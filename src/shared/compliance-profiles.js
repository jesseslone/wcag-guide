export const complianceProfileVersion = "cp-v1";

const profiles = Object.freeze({
  title_ii_2026: {
    id: "title_ii_2026",
    label: "Title II 2026",
    version: complianceProfileVersion,
    standard_target: "WCAG 2.1 AA",
    axe_tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    advisory: false,
    default: true
  },
  enhanced_22_aa: {
    id: "enhanced_22_aa",
    label: "Enhanced 2.2 AA",
    version: complianceProfileVersion,
    standard_target: "WCAG 2.2 AA",
    axe_tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
    advisory: false,
    default: false
  },
  advisory_best_practice: {
    id: "advisory_best_practice",
    label: "Advisory Best Practice",
    version: complianceProfileVersion,
    standard_target: "WCAG 2.1 AA + Best Practice",
    axe_tags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
    advisory: true,
    default: false
  },
  aaa_selective: {
    id: "aaa_selective",
    label: "AAA Selective",
    version: complianceProfileVersion,
    standard_target: "Selective AAA",
    axe_tags: ["wcag2aaa", "wcag21aaa", "wcag22aaa"],
    advisory: true,
    default: false
  }
});

export function listComplianceProfiles() {
  return Object.values(profiles).map((profile) => structuredClone(profile));
}

export function getDefaultComplianceProfile() {
  return structuredClone(profiles.title_ii_2026);
}

export function getComplianceProfile(profileId) {
  if (!profileId) {
    return getDefaultComplianceProfile();
  }

  const profile = profiles[profileId];
  if (!profile) {
    throw new Error(`Unknown compliance profile: ${profileId}`);
  }

  return structuredClone(profile);
}

export function resolveComplianceProfile(profile) {
  if (!profile) {
    return getDefaultComplianceProfile();
  }

  if (typeof profile === "string") {
    return getComplianceProfile(profile);
  }

  if (typeof profile === "object" && typeof profile.id === "string") {
    const resolved = getComplianceProfile(profile.id);
    return {
      ...resolved,
      ...structuredClone(profile),
      id: resolved.id,
      label: resolved.label,
      version: resolved.version,
      standard_target: resolved.standard_target,
      axe_tags: structuredClone(resolved.axe_tags)
    };
  }

  return getDefaultComplianceProfile();
}
