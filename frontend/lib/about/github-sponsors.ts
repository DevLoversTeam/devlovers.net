import 'server-only';

export interface Sponsor {
  login: string;
  name: string;
  email: string;
  avatarUrl: string;
  tierName: string;
  tierColor: 'gold' | 'silver' | 'bronze';
  monthlyPrice: number;
}

function getTierDetails(amount: number): {
  name: string;
  color: 'gold' | 'silver' | 'bronze';
} {
  if (amount >= 100) return { name: '🏆 Core Supporter', color: 'gold' };
  if (amount >= 50) return { name: '🎓 Impact Support', color: 'silver' };
  if (amount >= 25) return { name: '🧠 Community Support', color: 'silver' };
  if (amount >= 10) return { name: '🚀 Early Support', color: 'bronze' };
  return { name: '☕ Coffee Support', color: 'bronze' };
}

export async function getSponsors(): Promise<Sponsor[]> {
  const token = process.env.GITHUB_SPONSORS_TOKEN;

  if (!token) {
    console.warn('⚠️ GITHUB_SPONSORS_TOKEN is missing.');
    return [];
  }

  const query = `
    query {
      organization(login: "DevLoversTeam") {
        sponsorshipsAsMaintainer(first: 100, orderBy: {field: CREATED_AT, direction: DESC}, includePrivate: false) {
          nodes {
            tier { monthlyPriceInDollars }
            sponsorEntity {
              ... on User { login name email avatarUrl }
              ... on Organization { login name email avatarUrl }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store', // Завжди свіжі дані
    });

    const json = await res.json();

    if (json.errors) {
      console.error('❌ GitHub API Error:', json.errors[0].message);
      return [];
    }

    const rawNodes =
      json.data?.organization?.sponsorshipsAsMaintainer?.nodes || [];

    console.log(
      `✅ GitHub: Found ${rawNodes.length} sponsors for Organization`
    );

    const sponsors: Sponsor[] = rawNodes
      .map((node: any) => {
        const price = node.tier?.monthlyPriceInDollars || 0;
        const { name, color } = getTierDetails(price);

        if (!node.sponsorEntity) return null;

        return {
          login: node.sponsorEntity.login,
          name: node.sponsorEntity.name || node.sponsorEntity.login,
          email: node.sponsorEntity.email || '',
          avatarUrl: node.sponsorEntity.avatarUrl,
          monthlyPrice: price,
          tierName: name,
          tierColor: color,
        };
      })
      .filter(Boolean) as Sponsor[];

    return sponsors;
  } catch (error) {
    console.error('❌ Failed to fetch sponsors:', error);
    return [];
  }
}
