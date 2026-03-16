import {
  complianceProfileVersion,
  getComplianceProfile as getSharedComplianceProfile,
  getDefaultComplianceProfile as getSharedDefaultComplianceProfile,
  listComplianceProfiles as listSharedComplianceProfiles
} from "../shared/compliance-profiles.js";

function mapSharedProfile(profile) {
  return {
    id: profile.id,
    label: profile.label,
    version: profile.version,
    standardTarget: profile.standard_target,
    axeTags: [...profile.axe_tags],
    isDefault: profile.default
  };
}

export const complianceProfilesVersion = complianceProfileVersion;

export const complianceProfiles = Object.freeze(
  listSharedComplianceProfiles().map((profile) => Object.freeze(mapSharedProfile(profile)))
);

export function getDefaultComplianceProfile() {
  return mapSharedProfile(getSharedDefaultComplianceProfile());
}

export function getComplianceProfile(profileId) {
  try {
    return mapSharedProfile(getSharedComplianceProfile(profileId));
  } catch {
    return null;
  }
}
