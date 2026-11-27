/**
 * The tools that keep their work in a dossier: the identifier is also the
 * name of the tool's file in the dossier (`<id>.json`), so it never changes.
 */

export interface OutilDossier {
  titre: string
  /** Route of the in-app tool, or standalone page under the site base. */
  route?: string
  page?: string
}

export const OUTILS_DOSSIER: Record<string, OutilDossier> = {
  'site-setting': { titre: 'Assistant Site Setting', route: '/site-setting' },
  'donnees-environnementales': { titre: 'Données environnementales publiques', page: 'donnees-environnementales.html' },
  reseaux: { titre: 'Réseaux et concessionnaires', route: '/reseaux' },
  maillage: { titre: 'Création maillage', page: 'creation-maillage.html' },
  'logs-forage': { titre: 'Logs de forage', page: 'logs-forage.html' },
  'resultats-labo': { titre: 'Résultats labo', route: '/resultats-labo' },
  'suivi-temporel': { titre: 'Suivi temporel', route: '/suivi-temporel' },
  'interpretation-pfas': { titre: 'Interprétation PFAS', route: '/interpretation-pfas' },
  chromatogrammes: { titre: 'Chromatogrammes hydrocarbures', route: '/chromatogrammes' },
  'conformite-rejets': { titre: 'Conformité des rejets', route: '/conformite-rejets' },
  'verification-livrables': { titre: 'Vérification de livrables SSP', route: '/verification-livrables' },
}

export const titreOutil = (id: string) => OUTILS_DOSSIER[id]?.titre ?? id
