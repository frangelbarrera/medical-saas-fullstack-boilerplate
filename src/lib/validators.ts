/**
 * Validates a National ID.
 * NOTE: This currently follows a basic check (10 or 13 digits) which is common for
 * Ecuadorian IDs (Cédula/RUC). It is the central place where you should implement
 * your country's specific validation algorithm (e.g., Modulo 10 checksum).
 */
export const validateNationalID = (id: string): boolean => {
  if (!id) return false;

  // Clean the input of any character that is not a number (spaces, hyphens, etc.)
  const cleanId = id.trim().replace(/\D/g, "");

  // Default implementation (10 or 13 digits)
  return cleanId.length === 10 || cleanId.length === 13;
};
