import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { supabase } from '@/services/supabase/client';

const normalizePhone = (value: string) => {
  const clean = value.replace(/[^\d+]/g, '');
  return clean.startsWith('+') ? clean : `+${clean.replace(/^0+/, '')}`;
};

export const contactService = {
  async syncContacts() {
    const permission = await Contacts.requestPermissionsAsync();
    if (permission.status !== 'granted') return { usersOnApp: [], inviteContacts: [] };

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
    });

    const contacts = data
      .filter((c) => c.phoneNumbers?.length)
      .map((c) => ({
        id: c.id,
        name: c.name ?? 'Unknown',
        phones: (c.phoneNumbers ?? []).map((x) => normalizePhone(x.number ?? '')).filter(Boolean),
      }));

    const phones = [...new Set(contacts.flatMap((c) => c.phones))];
    if (phones.length === 0) return { usersOnApp: [], inviteContacts: [] };
    const { data: users } = await supabase.from('profiles').select('*').in('phone_number', phones);
    const userByPhone = new Map((users ?? []).map((user) => [user.phone_number, user]));

    const usersOnApp: Array<{ id: string; name: string; phone: string; userId: string; username: string }> = [];
    const inviteContacts: Array<{ id: string; name: string; phone: string }> = [];

    contacts.forEach((contact) => {
      const appPhone = contact.phones.find((phone) => userByPhone.has(phone));
      if (appPhone) {
        const profile = userByPhone.get(appPhone);
        if (profile) {
          usersOnApp.push({
            id: contact.id,
            name: contact.name,
            phone: appPhone,
            userId: profile.id,
            username: profile.username ?? contact.name,
          });
        }
      }
      else if (contact.phones[0]) inviteContacts.push({ id: contact.id, name: contact.name, phone: contact.phones[0] });
    });

    return { usersOnApp, inviteContacts };
  },
  async inviteBySms(phone: string) {
    await Linking.openURL(`sms:${phone}?body=${encodeURIComponent('Join me on VibeChat!')}`);
  },
};
