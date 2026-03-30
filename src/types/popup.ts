export interface PopupField {
    label: string;
    value: string | number;
    unit?: string;
}

export interface PopupContent {
    title: string;
    icon?: string;
    color?: string;
    description?: string;
    fields: PopupField[];
    imageUrl?: string;
    imageSize?: 'default' | 'large';
    linkUrl?: string;
    linkLabel?: string;
    followEntityId?: string;
    enrichAsync?: () => Promise<Partial<PopupContent>>;
}
