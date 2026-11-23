# Critères d'acceptation V1 (§29) — état et mode de vérification

Légende : **U** = test unitaire (`source/test`), **F** = contrôle fonctionnel du `.pbiviz` compilé dans Chrome contre un faux host Power BI (`source/harness/selftest.html`), **V** = vérifié visuellement sur capture (`apercu/`).
Tous les critères sont couverts par au moins un de ces moyens. **Aucun n'a pu être rejoué dans Power BI Desktop ou le service** : la dernière section liste ce qu'il faut y contrôler.

## Données
| Critère | État | Vérification |
|---|---|---|
| Fonctionne avec une donnée mensuelle / trimestrielle / annuelle | OK | U, F, V |
| Nombre de périodes configurable, 12 par défaut (1 à 36) | OK | U, F |
| Affiche les X périodes les plus récentes | OK | U, F |
| Tri stable (chronologique croissant / décroissant, ordre du champ, clé de tri) | OK | U, F |

## Valeurs
| Critère | État | Vérification |
|---|---|---|
| Primary Value obligatoire (avertissement si absente) ; Secondary facultative | OK | U |
| Actual ou Projected librement choisi comme Primary | OK | U, V |
| Secondary affichée en plus petit, avec libellé | OK | U, F, V |
| Unités et décimales configurables (exemples du §7.4 : 975, 12.4K, 1.7M, 8.3%, €1.2M) | OK | U |
| Valeurs vides : promotion de Secondary, « No data », zéro affiché, valeur invalide | OK | U, F |

## Target
| Critère | État | Vérification |
|---|---|---|
| Target facultative ; le visual fonctionne sans (ligne retirée, sans espace vide) | OK | U, F, V |
| Libellé configurable ; écart masquable (masqué par défaut) | OK | U, F |

## Statut
| Critère | État | Vérification |
|---|---|---|
| Seuils configurables par instance | OK | U, F |
| Higher is better / Lower is better (et Neutral) | OK | U, F |
| Seul le badge change de couleur | OK | F, V |
| Icônes configurables (7 + aucune), embarquées | OK | F |
| Mode Status Code + Status Label | OK | U, F |

## Comparaisons
| Critère | État | Vérification |
|---|---|---|
| Deux comparaisons génériques | OK | U, F, V |
| Libellés venant du modèle | OK | U, F |
| Logique de couleur inversable | OK | U |
| Masquables indépendamment | OK | U, F |

## Graphique
| Critère | État | Vérification |
|---|---|---|
| Actual et Previous Year comparés ; Grouped et Overlay | OK | U, F, V |
| Période courante : Actual + Projection Remaining | OK | U, F, V |
| Projection différenciée par couleur **et** motif (+ contour) | OK | F, V |
| Projection < Actual : aucun segment négatif | OK | U, F |
| Clic sur une barre = sélection de la période | OK (faux host) | F |
| Survol = tooltip | OK (faux host) | U, F |

## Navigation
| Critère | État | Vérification |
|---|---|---|
| Zone Details visible, configurable, position stable (≥ 28 px, coin inférieur droit, indépendante du nombre de barres) | OK | F |
| Action URL configurable (http/https uniquement) | OK (faux host) | F |
| Compatible avec un bouton Power BI superposé ; interactions du graphique préservées | Conçu pour | À valider dans Power BI |

## Responsive
| Critère | État | Vérification |
|---|---|---|
| Fonctionne à partir de 260 px de largeur (et en dessous, en mode minimal) | OK | F, V |
| Éléments secondaires masqués progressivement | OK | U, F, V |
| Textes principaux lisibles ; aucun défilement horizontal | OK | F (24 scénarios × 9 tailles) |

## Accessibilité
| Critère | État | Vérification |
|---|---|---|
| Navigation clavier, focus visible | OK (navigateur) | F |
| Contraste élevé | OK (palette simulée) | F, V |
| Description accessible (tuile et barres) | OK | U, F |
| Projection identifiable autrement que par la couleur | OK | F, V |
| Statut non communiqué uniquement par rouge / vert (icône + texte) | OK | F, V |
| Couleurs par défaut ≥ 4,5:1 | OK | U |

## À contrôler dans Power BI Desktop / Service (recette)

1. Import du `.pbiviz`, icône dans le volet, page d'accueil sans champ.
2. Liaison des 25 champs ; comportement avec une colonne date (sans hiérarchie), une colonne texte triée par une autre colonne, une clé `Period Sort Key`.
3. Panneau de format : les 11 cartes s'affichent, chaque réglage est appliqué et conservé à l'enregistrement, « Rétablir les valeurs par défaut » fonctionne.
4. Clic sur une barre : filtrage / surlignage des autres visuels ; Ctrl+clic ; clic sur un autre visuel (surlignage de la tuile) ; signets.
5. Tooltips : tooltip standard, champs du rôle Tooltip Fields, page d'info-bulle de rapport.
6. Clic droit : menu contextuel, extraction vers une page de détail.
7. Bouton transparent superposé à la zone Details ; action URL (boîte de confirmation de Power BI).
8. Mode contraste élevé de Windows, navigation clavier depuis le canevas du rapport (Ctrl+→ / Entrée pour entrer dans le visuel).
9. Formats numériques en français et néerlandais.
10. Service Power BI, export PDF / PowerPoint de la page.
