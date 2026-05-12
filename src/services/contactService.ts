import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { supabase } from '@/services/supabase/client';
import { normalizePhoneNumbers } from '@/utils/phone';

const PROFILE_CHUNK = 100;

export const contactService = {
  async syncContacts() {
    const permission = await Contacts.requestPermissionsAsync();
    if (permission.status !== 'granted') return { usersOnApp: [], inviteContacts: [] };

    const { data } = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Name,
        Contacts.Fields.FirstName,
        Contacts.Fields.LastName,
      ],
    });

    type Row = {
      id: string;
      name: string;
      phones: string[];
    };

    const rows: Row[] = (data ?? [])
      .filter((c) => (c.phoneNumbers?.length ?? 0) > 0)
      .map((c) => {
        const rawNumbers = (c.phoneNumbers ?? []).map((x) => x.number ?? '');
        const phones = normalizePhoneNumbers(rawNumbers);
        return {
          id: c.id,
          name: (c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()) || 'Unknown',
          phones,
        };
      })
      .filter((c) => c.phones.length > 0);

    const phones = [...new Set(rows.flatMap((c) => c.phones))];
    if (phones.length === 0) return { usersOnApp: [], inviteContacts: [] };

    const profileRows: Record<string, unknown>[] = [];
    for (let i = 0; i < phones.length; i += PROFILE_CHUNK) {
      const slice = phones.slice(i, i + PROFILE_CHUNK);
      const { data: batch } = await supabase.from('profiles').select('*').in('phone_number', slice);
      profileRows.push(...(batch ?? []));
    }

    const userByPhone = new Map(
      profileRows
        .filter((u) => typeof u.phone_number === 'string' && u.phone_number)
        .map((user) => [user.phone_number as string, user]),
    );

    const usersOnApp: Array<{
      id: string;
      name: string;
      phone: string;
      userId: string;
      username: string;
      avatarUrl: string | null;
    }> = [];
    const inviteContacts: Array<{ id: string; name: string; phone: string }> = [];

    rows.forEach((contact) => {
      const appPhone = contact.phones.find((phone) => userByPhone.has(phone));
      if (appPhone) {
        const profile = userByPhone.get(appPhone) as
          | { id: string; username?: string | null; avatar_url?: string | null }
          | undefined;
        if (profile) {
          usersOnApp.push({
            id: contact.id,
            name: contact.name,
            phone: appPhone,
            userId: profile.id,
            username: (profile.username ?? contact.name) as string,
            avatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
          });
        }
      } else {
        inviteContacts.push({
          id: contact.id,
          name: contact.name,
          phone: contact.phones[0],
        });
      }
    });

    return { usersOnApp, inviteContacts };
  },

  async inviteBySms(phone: string) {
    await Linking.openURL(`sms:${phone}?body=${encodeURIComponent('Join me on VibeChat!')}`);
  },
};
