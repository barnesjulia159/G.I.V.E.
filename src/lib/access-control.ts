type Actor = {
  id: string;
  role: "admin" | "nonprofit" | "volunteer";
  isActive: boolean;
};

export function isActiveRole(actor: Actor | null, roles: readonly Actor["role"][]) {
  return actor?.isActive === true && roles.includes(actor.role);
}

export function managedOpportunityScope(actor: Actor) {
  if (!isActiveRole(actor, ["admin", "nonprofit"])) {
    throw new Error("An active organizer account is required.");
  }
  return actor.role === "admin" ? {} : { organization: { user_id: actor.id } };
}
