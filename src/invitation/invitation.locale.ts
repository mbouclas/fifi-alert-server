/**
 * Email chrome strings for the invitation template, per language.
 *
 * The subject and body arrive fully localised from the web app; only the
 * layout chrome (header, footer, "why you got this") is ours. There is no
 * server-side i18n string helper in this codebase (src/i18n only resolves the
 * request language), so this small dictionary is the source of truth.
 */
export interface IInvitationChrome {
  header: string;
  /** `{senderName}` is replaced (after escaping) at render time. */
  receivedBecause: string;
  tagline: string;
  rights: string;
  privacy: string;
  support: string;
}

const CHROME: Record<string, IInvitationChrome> = {
  en: {
    header: '🐾 FiFi Alert',
    receivedBecause:
      'You received this email because {senderName} invited you to FiFi Alert. No account was created for you and you will not be emailed again unless they resend the invitation.',
    tagline: 'Helping reunite lost pets with their families.',
    rights: 'All rights reserved.',
    privacy: 'Privacy Policy',
    support: 'Support',
  },
  el: {
    header: '🐾 FiFi Alert',
    receivedBecause:
      'Λάβατε αυτό το email επειδή ο/η {senderName} σας προσκάλεσε στο FiFi Alert. Δεν δημιουργήθηκε λογαριασμός για εσάς και δεν θα λάβετε άλλο email εκτός αν σταλεί ξανά η πρόσκληση.',
    tagline: 'Βοηθάμε τα χαμένα κατοικίδια να βρουν τον δρόμο για το σπίτι.',
    rights: 'Με επιφύλαξη παντός δικαιώματος.',
    privacy: 'Πολιτική Απορρήτου',
    support: 'Υποστήριξη',
  },
};

export const INVITATION_CHROME_FALLBACK_LOCALE = 'en';

export function getInvitationChrome(locale: string): IInvitationChrome {
  return CHROME[locale] ?? CHROME[INVITATION_CHROME_FALLBACK_LOCALE];
}
