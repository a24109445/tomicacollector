import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useSQLiteContext } from 'expo-sqlite';

import {
  createTomica,
  deleteTomica,
  getTomicaByBarcode,
  getTomicaById,
  listTomicas,
  updateTomica,
} from './database/tomicaRepository';
import type { Screen, Tomica, TomicaDraft } from './types';

const emptyDraft = (barcode = ''): TomicaDraft => ({
  barcode,
  number: '',
  name: '',
  series: '',
  version: '',
  madeIn: '',
  year: '',
  ownedCount: 1,
  hasSticker: 0,
  photoUri: '',
  note: '',
});

const seriesOptions = [
  '一般紅盒',
  'Dream Tomica',
  '會場車',
  '舊藍標',
  '舊紅標',
  '日制舊紅標',
  'TLV',
  'Tomica Premium',
  'Boxset',
  'Tomica Shop',
  '聯名限定',
  '其他',
];

const ownedCountOptions = ['1', '2', '3', '4', '5'];

const isCustomSeries = (series: string) =>
  Boolean(series) && !seriesOptions.includes(series);

export function TomicaCollectorApp() {
  const db = useSQLiteContext();
  const [screen, setScreen] = useState<Screen>({ name: 'list' });
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Tomica[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await listTomicas(db, query));
    } finally {
      setIsLoading(false);
    }
  }, [db, query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const goList = () => {
    setScreen({ name: 'list' });
    refresh();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {screen.name === 'list' && (
        <ListScreen
          items={items}
          query={query}
          isLoading={isLoading}
          onChangeQuery={setQuery}
          onRefresh={refresh}
          onAdd={() => setScreen({ name: 'form' })}
          onScan={() => setScreen({ name: 'scanner' })}
          onEdit={(id) => setScreen({ name: 'form', id })}
          onDelete={async (id) => {
            await deleteTomica(db, id);
            refresh();
          }}
        />
      )}
      {screen.name === 'form' && (
        <FormScreen
          id={screen.id}
          initialBarcode={screen.barcode}
          onCancel={goList}
          onSaved={goList}
        />
      )}
      {screen.name === 'scanner' && (
        <ScannerScreen
          onClose={goList}
          onAdd={(barcode) => setScreen({ name: 'form', barcode })}
          onEdit={(id) => setScreen({ name: 'form', id })}
        />
      )}
    </SafeAreaView>
  );
}

type ListScreenProps = {
  items: Tomica[];
  query: string;
  isLoading: boolean;
  onChangeQuery: (query: string) => void;
  onRefresh: () => void;
  onAdd: () => void;
  onScan: () => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

function ListScreen(props: ListScreenProps) {
  return (
    <View style={styles.container}>
      <Header title="TomicaCollector" subtitle="本機 SQLite 收藏管理" />
      <View style={styles.toolbar}>
        <Pressable style={styles.primaryButton} onPress={props.onAdd}>
          <Text style={styles.primaryButtonText}>新增收藏</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={props.onScan}>
          <Text style={styles.secondaryButtonText}>掃描條碼</Text>
        </Pressable>
      </View>
      <TextInput
        style={styles.searchInput}
        value={props.query}
        onChangeText={props.onChangeQuery}
        placeholder="搜尋車名、編號、條碼、系列"
        autoCapitalize="none"
      />
      {props.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={props.items}
          keyExtractor={(item) => String(item.id)}
          refreshing={props.isLoading}
          onRefresh={props.onRefresh}
          contentContainerStyle={props.items.length ? styles.list : styles.emptyList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>目前沒有收藏，先新增或掃描一台 Tomica。</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.photoUri ? (
                <Image source={{ uri: item.photoUri }} style={styles.cardPhoto} />
              ) : null}
              <Text style={styles.cardTitle}>
                {item.number ? `${item.number} ` : ''}
                {item.name}
              </Text>
              <Text style={styles.cardMeta}>條碼：{item.barcode}</Text>
              <Text style={styles.cardMeta}>系列：{item.series || '未填'} / 年份：{item.year || '未填'}</Text>
              <Text style={styles.cardMeta}>車貼：{item.hasSticker ? '有' : '無'}</Text>
              <Text style={styles.cardMeta}>數量：{item.ownedCount}</Text>
              {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
              <View style={styles.cardActions}>
                <Pressable style={styles.smallButton} onPress={() => props.onEdit(item.id)}>
                  <Text style={styles.smallButtonText}>編輯</Text>
                </Pressable>
                <Pressable
                  style={[styles.smallButton, styles.dangerButton]}
                  onPress={() => {
                    Alert.alert('刪除收藏', `確定刪除「${item.name}」？`, [
                      { text: '取消', style: 'cancel' },
                      { text: '刪除', style: 'destructive', onPress: () => props.onDelete(item.id) },
                    ]);
                  }}
                >
                  <Text style={styles.dangerButtonText}>刪除</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

type FormScreenProps = {
  id?: number;
  initialBarcode?: string;
  onCancel: () => void;
  onSaved: () => void;
};

function FormScreen({ id, initialBarcode, onCancel, onSaved }: FormScreenProps) {
  const db = useSQLiteContext();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [draft, setDraft] = useState<TomicaDraft>(emptyDraft(initialBarcode));
  const [isSaving, setIsSaving] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [isSeriesPickerOpen, setIsSeriesPickerOpen] = useState(false);
  const [isCountPickerOpen, setIsCountPickerOpen] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) {
        setDraft(emptyDraft(initialBarcode));
        return;
      }

      const item = await getTomicaById(db, id);
      if (item) {
        setDraft({
          barcode: item.barcode,
          number: item.number,
          name: item.name,
          series: item.series,
          version: item.version,
          madeIn: item.madeIn,
          year: item.year,
          ownedCount: item.ownedCount,
          hasSticker: item.hasSticker,
          photoUri: item.photoUri,
          note: item.note,
        });
      }
    }

    load();
  }, [db, id, initialBarcode]);

  const setField = (field: keyof TomicaDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: field === 'ownedCount' ? Number(value.replace(/\D/g, '')) || 1 : value,
    }));
  };

  const save = async () => {
    if (!draft.barcode.trim() || !draft.number.trim() || !draft.name.trim()) {
      Alert.alert('資料不足', '條碼、編號、車名為必填。');
      return;
    }

    setIsSaving(true);
    try {
      if (id) {
        await updateTomica(db, id, draft);
      } else {
        await createTomica(db, draft);
      }
      onSaved();
    } catch (error) {
      Alert.alert('儲存失敗', error instanceof Error ? error.message : '請確認條碼沒有重複。');
    } finally {
      setIsSaving(false);
    }
  };

  const openCamera = async () => {
    if (!permission?.granted) {
      const nextPermission = await requestPermission();
      if (!nextPermission.granted) {
        Alert.alert('需要相機權限', '請允許相機權限，才能拍攝收藏照片。');
        return;
      }
    }

    setIsTakingPhoto(true);
  };

  const takePhoto = async () => {
    const photo = await cameraRef.current?.takePictureAsync({
      quality: 0.75,
      skipProcessing: false,
    });

    if (photo?.uri) {
      setDraft((current) => ({ ...current, photoUri: photo.uri }));
      setIsTakingPhoto(false);
    }
  };

  if (isTakingPhoto) {
    return (
      <View style={styles.photoCameraScreen}>
        <CameraView ref={cameraRef} style={styles.photoCamera} facing="back" />
        <View style={styles.photoCameraActions}>
          <Pressable style={[styles.secondaryButton, styles.noFlexButton]} onPress={() => setIsTakingPhoto(false)}>
            <Text style={styles.secondaryButtonText}>取消</Text>
          </Pressable>
          <Pressable style={[styles.primaryButton, styles.noFlexButton]} onPress={takePhoto}>
            <Text style={styles.primaryButtonText}>拍攝照片</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <Header title={id ? '編輯收藏' : '新增收藏'} subtitle="資料只存在這支手機" />
      <ScrollView contentContainerStyle={styles.form}>
        <View style={styles.photoSection}>
          <Text style={styles.label}>收藏照片</Text>
          {draft.photoUri ? (
            <Image source={{ uri: draft.photoUri }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>尚未拍攝照片</Text>
            </View>
          )}
          <View style={styles.toolbar}>
            <Pressable style={styles.secondaryButton} onPress={openCamera}>
              <Text style={styles.secondaryButtonText}>{draft.photoUri ? '重新拍攝' : '拍攝照片'}</Text>
            </Pressable>
            {draft.photoUri ? (
              <Pressable
                style={[styles.secondaryButton, styles.dangerOutlineButton]}
                onPress={() => setDraft((current) => ({ ...current, photoUri: '' }))}
              >
                <Text style={styles.dangerButtonText}>移除照片</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <Field label="條碼 *" value={draft.barcode} onChangeText={(value) => setField('barcode', value)} keyboardType="number-pad" />
        <Field label="編號 *" value={draft.number} onChangeText={(value) => setField('number', value)} />
        <Field label="車名 *" value={draft.name} onChangeText={(value) => setField('name', value)} />
        <SelectField
          label="系列"
          value={isCustomSeries(draft.series) ? '其他' : draft.series || '未選擇'}
          onPress={() => setIsSeriesPickerOpen(true)}
        />
        {isCustomSeries(draft.series) || draft.series === '其他' ? (
          <Field
            label="其他系列"
            value={draft.series === '其他' ? '' : draft.series}
            onChangeText={(value) => setField('series', value)}
          />
        ) : null}
        <Field label="年份" value={draft.year} onChangeText={(value) => setField('year', value)} keyboardType="number-pad" />
        <SelectField
          label="持有數量"
          value={String(draft.ownedCount)}
          onPress={() => setIsCountPickerOpen(true)}
        />
        <CheckboxField
          label="是否有車貼"
          checked={Boolean(draft.hasSticker)}
          onPress={() =>
            setDraft((current) => ({ ...current, hasSticker: current.hasSticker ? 0 : 1 }))
          }
        />
        <Field label="備註" value={draft.note} onChangeText={(value) => setField('note', value)} multiline />
        <View style={styles.toolbar}>
          <Pressable style={styles.secondaryButton} onPress={onCancel} disabled={isSaving}>
            <Text style={styles.secondaryButtonText}>取消</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={save} disabled={isSaving}>
            <Text style={styles.primaryButtonText}>{isSaving ? '儲存中...' : '儲存'}</Text>
          </Pressable>
        </View>
      </ScrollView>
      <OptionModal
        title="選擇系列"
        visible={isSeriesPickerOpen}
        options={seriesOptions}
        getLabel={(option) => option || '未選擇'}
        onClose={() => setIsSeriesPickerOpen(false)}
        onSelect={(option) => {
          setField('series', option);
          setIsSeriesPickerOpen(false);
        }}
      />
      <OptionModal
        title="選擇持有數量"
        visible={isCountPickerOpen}
        options={ownedCountOptions}
        onClose={() => setIsCountPickerOpen(false)}
        onSelect={(option) => {
          setField('ownedCount', option);
          setIsCountPickerOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

type ScannerScreenProps = {
  onClose: () => void;
  onAdd: (barcode: string) => void;
  onEdit: (id: number) => void;
};

function ScannerScreen({ onClose, onAdd, onEdit }: ScannerScreenProps) {
  const db = useSQLiteContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [lastBarcode, setLastBarcode] = useState('');
  const [result, setResult] = useState<Tomica | null>(null);
  const [status, setStatus] = useState<'idle' | 'found' | 'missing'>('idle');
  const [isHandlingScan, setIsHandlingScan] = useState(false);

  const handleScan = async ({ data }: BarcodeScanningResult) => {
    if (isHandlingScan || data === lastBarcode) {
      return;
    }

    setIsHandlingScan(true);
    setLastBarcode(data);
    const found = await getTomicaByBarcode(db, data);
    setResult(found);
    setStatus(found ? 'found' : 'missing');
    setTimeout(() => setIsHandlingScan(false), 1200);
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Header title="掃描條碼" subtitle="需要 iPhone 相機權限" />
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>允許相機權限</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onClose}>
          <Text style={styles.secondaryButtonText}>返回</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.scannerContainer}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={handleScan}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
        }}
      />
      <View style={styles.scanPanel}>
        <Text style={styles.scanTitle}>對準 Tomica 外盒條碼</Text>
        {status === 'idle' ? <Text style={styles.scanText}>掃描結果會顯示在這裡。</Text> : null}
        {status === 'found' && result ? (
          <View style={styles.scanResultBox}>
            <Text style={styles.foundText}>已收藏</Text>
            {result.photoUri ? (
              <Image source={{ uri: result.photoUri }} style={styles.scanPhoto} />
            ) : null}
            <Text style={styles.cardTitle}>{result.number} {result.name}</Text>
            <Text style={styles.scanText}>條碼：{result.barcode}</Text>
            <Text style={styles.scanText}>系列：{result.series || '未填'} / 車貼：{result.hasSticker ? '有' : '無'}</Text>
            <Pressable style={[styles.primaryButton, styles.fullWidthButton]} onPress={() => onEdit(result.id)}>
              <Text style={styles.primaryButtonText}>查看 / 編輯</Text>
            </Pressable>
          </View>
        ) : null}
        {status === 'missing' ? (
          <View style={styles.scanResultBox}>
            <Text style={styles.missingText}>尚未收藏</Text>
            <Text style={styles.scanText}>條碼：{lastBarcode}</Text>
            <Pressable style={[styles.primaryButton, styles.fullWidthButton]} onPress={() => onAdd(lastBarcode)}>
              <Text style={styles.primaryButtonText}>新增收藏</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.scanActions}>
          <Pressable style={styles.secondaryButton} onPress={() => {
            setLastBarcode('');
            setResult(null);
            setStatus('idle');
          }}>
            <Text style={styles.secondaryButtonText}>重新掃描</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>返回列表</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  onPress: () => void;
};

function SelectField({ label, value, onPress }: SelectFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.selectInput} onPress={onPress}>
        <Text style={styles.selectText}>{value}</Text>
        <Text style={styles.selectArrow}>⌄</Text>
      </Pressable>
    </View>
  );
}

type CheckboxFieldProps = {
  label: string;
  checked: boolean;
  onPress: () => void;
};

function CheckboxField({ label, checked, onPress }: CheckboxFieldProps) {
  return (
    <Pressable style={styles.checkboxRow} onPress={onPress}>
      <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

type OptionModalProps = {
  title: string;
  visible: boolean;
  options: string[];
  getLabel?: (option: string) => string;
  onClose: () => void;
  onSelect: (option: string) => void;
};

function OptionModal({ title, visible, options, getLabel, onClose, onSelect }: OptionModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          {options.map((option, index) => (
            <Pressable
              key={`${option}-${index}`}
              style={styles.optionRow}
              onPress={() => onSelect(option)}
            >
              <Text style={styles.optionText}>{getLabel ? getLabel(option) : option}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'number-pad';
  multiline?: boolean;
};

function Field({ label, value, onChangeText, keyboardType = 'default', multiline = false }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize="none"
      />
    </View>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const colors = {
  background: '#f8fafc',
  surface: '#ffffff',
  text: '#111827',
  muted: '#64748b',
  border: '#dbe3ef',
  primary: '#d71920',
  primaryDark: '#a90f15',
  soft: '#fff1f2',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  toolbar: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '700',
  },
  noFlexButton: {
    flex: 0,
    minWidth: 132,
  },
  fullWidthButton: {
    flex: 0,
    width: '100%',
    marginTop: 6,
  },
  searchInput: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  loader: {
    marginTop: 24,
  },
  list: {
    gap: 12,
    paddingBottom: 20,
  },
  emptyList: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyText: {
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 5,
  },
  cardPhoto: {
    width: '100%',
    height: 170,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    marginBottom: 6,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  cardMeta: {
    color: colors.muted,
    lineHeight: 20,
  },
  note: {
    color: colors.text,
    marginTop: 4,
    lineHeight: 20,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  smallButton: {
    minHeight: 38,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.soft,
  },
  smallButtonText: {
    color: colors.primaryDark,
    fontWeight: '800',
  },
  dangerButton: {
    backgroundColor: '#fef2f2',
  },
  dangerButtonText: {
    color: '#b91c1c',
    fontWeight: '800',
  },
  form: {
    gap: 12,
    paddingBottom: 24,
  },
  photoSection: {
    gap: 8,
  },
  photoPreview: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  photoPlaceholder: {
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  photoPlaceholderText: {
    color: colors.muted,
    fontWeight: '700',
  },
  photoCameraScreen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  photoCamera: {
    flex: 1,
  },
  photoCameraActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: colors.surface,
  },
  field: {
    gap: 6,
  },
  label: {
    color: colors.text,
    fontWeight: '700',
  },
  input: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  selectInput: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectText: {
    color: colors.text,
    fontSize: 16,
  },
  selectArrow: {
    color: colors.muted,
    fontSize: 22,
    fontWeight: '800',
  },
  checkboxRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  checkboxBoxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkboxMark: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  checkboxLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  multilineInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
  },
  modalCard: {
    maxHeight: '78%',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: colors.surface,
    padding: 16,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  optionRow: {
    minHeight: 46,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  scanPanel: {
    backgroundColor: colors.surface,
    padding: 16,
    gap: 12,
  },
  scanTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  scanText: {
    color: colors.muted,
    lineHeight: 21,
  },
  scanResultBox: {
    gap: 6,
  },
  scanActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  scanPhoto: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  foundText: {
    color: '#15803d',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  missingText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  dangerOutlineButton: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
});
