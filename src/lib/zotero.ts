import { ZoteroConfig, ZoteroItem } from '@/types/zotero';

const ZOTERO_API_BASE = 'https://api.zotero.org';

export class ZoteroClient {
    private config: ZoteroConfig;

    constructor(config: ZoteroConfig) {
        this.config = config;
    }

    private getHeaders() {
        return {
            'Zotero-API-Key': this.config.apiKey,
            'Zotero-API-Version': '3',
        };
    }

    async testConnection(): Promise<boolean> {
        try {
            // Fetch a single item to verify credentials and access
            const response = await fetch(
                `${ZOTERO_API_BASE}/users/${this.config.userId}/items?limit=1`,
                {
                    headers: this.getHeaders(),
                }
            );
            return response.ok;
        } catch (error) {
            console.error('Zotero connection test failed:', error);
            return false;
        }
    }

    async getCollectionItems(limit: number = 20): Promise<ZoteroItem[]> {
        try {
            // Fetch top items from the collection, sorted by modification date desc
            // We rely on the user to provide the collection ID
            let url: string;

            // Check if this is a group library selection
            if (this.config.collectionId.startsWith('group:')) {
                const parts = this.config.collectionId.split(':');
                const groupId = parts[1];
                const collectionKey = parts[2]; // May be undefined for entire library

                if (collectionKey) {
                    // Fetch from specific group collection
                    url = `${ZOTERO_API_BASE}/groups/${groupId}/collections/${collectionKey}/items/top?limit=${limit}&sort=dateModified&direction=desc`;
                } else {
                    // Fetch entire group library
                    url = `${ZOTERO_API_BASE}/groups/${groupId}/items/top?limit=${limit}&sort=dateModified&direction=desc`;
                }
            } else {
                // Fetch from user library collection
                url = `${ZOTERO_API_BASE}/users/${this.config.userId}/collections/${this.config.collectionId}/items/top?limit=${limit}&sort=dateModified&direction=desc`;
            }

            const response = await fetch(url, {
                headers: this.getHeaders(),
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch Zotero items: ${response.statusText}`);
            }

            const items = await response.json();
            return items as ZoteroItem[];
        } catch (error) {
            console.error('Error fetching Zotero items:', error);
            throw error;
        }
    }

    async getCollections(): Promise<import('@/types/zotero').ZoteroCollection[]> {
        try {
            const response = await fetch(
                `${ZOTERO_API_BASE}/users/${this.config.userId}/collections`,
                {
                    headers: this.getHeaders(),
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch Zotero collections: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching Zotero collections:', error);
            throw error;
        }
    }

    async getGroups(): Promise<Array<{ groupId: string; groupName: string; collections: import('@/types/zotero').ZoteroCollection[] }>> {
        try {
            // Fetch user's groups
            const groupsResponse = await fetch(
                `${ZOTERO_API_BASE}/users/${this.config.userId}/groups`,
                {
                    headers: this.getHeaders(),
                }
            );

            if (!groupsResponse.ok) {
                throw new Error(`Failed to fetch groups: ${groupsResponse.statusText}`);
            }

            const groups = await groupsResponse.json();

            // Fetch collections for each group
            const groupsWithCollections = await Promise.all(
                groups.map(async (group: any) => {
                    try {
                        const collectionsResponse = await fetch(
                            `${ZOTERO_API_BASE}/groups/${group.id}/collections`,
                            {
                                headers: this.getHeaders(),
                            }
                        );

                        const collections = collectionsResponse.ok
                            ? await collectionsResponse.json()
                            : [];

                        return {
                            groupId: group.id.toString(),
                            groupName: group.data.name,
                            collections,
                        };
                    } catch (error: any) {
                        console.error(`Error fetching collections for group ${group.id}:`, error);
                        return {
                            groupId: group.id.toString(),
                            groupName: group.data.name,
                            collections: [],
                        };
                    }
                })
            );

            return groupsWithCollections;
        } catch (error) {
            console.error('Error fetching Zotero groups:', error);
            throw error;
        }
    }

    /**
     * Helper to format authors from Zotero creators array
     */
    static formatAuthors(creators: ZoteroItem['data']['creators']): string {
        if (!creators || creators.length === 0) return 'Unknown Author';
        return creators
            .map((c) => c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim())
            .join(', ');
    }

    /**
     * Helper to extract the year from a date string
     */
    static extractYear(dateString?: string): string {
        if (!dateString) return '';
        const match = dateString.match(/\d{4}/);
        return match ? match[0] : dateString;
    }
}
