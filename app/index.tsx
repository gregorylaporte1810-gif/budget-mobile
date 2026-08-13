import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

type TransactionType = 'expense' | 'income' | 'remboursement';

interface Transaction {
  id: string;
  text: string;
  amount: number;
  category: string;
  type: TransactionType;
  date: string;
  isRecurring?: boolean;
}

interface CategoryLimits {
  [key: string]: number;
}

const CATEGORIES = [
  'Alimentation',
  'Loyer',
  'Loisirs',
  'Transports',
  'Factures',
  'Revenus',
  'Autre',
];

const COLORS = [
  '#ff7675',
  '#74b9ff',
  '#55efc4',
  '#ffeaa7',
  '#a29bfe',
  '#fd79a8',
  '#fdcb6e',
];

const STORAGE_KEY = '@transactions_data';
const BUDGET_LIMIT_KEY = '@budget_limit_data';
const CAT_LIMITS_KEY = '@category_limits_data';
const SAVINGS_RATE_KEY = '@savings_rate_data';
const THEME_KEY = '@theme_data';

export default function HomeScreen() {
// Injection du style d'impression pour le Web (version propre)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const style = document.createElement('style');
      style.innerHTML = `
        @media print {
          /* Masquer les formulaires, les champs de saisie, les boutons et les filtres */
          input, button, .themeToggle, .addButton, 
          .typeToggleContainer, .categoryContainer, 
          .checkboxContainer, .filterContainer {
            display: none !important;
          }
          
          /* Ne garder que le résumé, les graphiques et l'historique propre */
          body, html, div { 
            height: auto !important; 
            max-height: none !important; 
            overflow: visible !important; 
            position: static !important; 
            background: #ffffff !important;
            color: #000000 !important;
          }
        }
      `;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
  }, []);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [isRecurring, setIsRecurring] = useState(false);
  const [activeFilter, setActiveFilter] = useState('Toutes');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showWebModal, setShowWebModal] = useState(false);
  const [showEvolutionModal, setShowEvolutionModal] = useState(false);

  const [monthlyLimit, setMonthlyLimit] = useState<string>('1200');
  const [inputLimit, setInputLimit] = useState<string>('');

  const [savingsRate, setSavingsRate] = useState<number>(20);
  const [categoryLimits, setCategoryLimits] = useState<CategoryLimits>({
    Alimentation: 300,
    Loisirs: 150,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const storedData = await AsyncStorage.getItem(STORAGE_KEY);
      const storedLimit = await AsyncStorage.getItem(BUDGET_LIMIT_KEY);
      const storedCatLimits = await AsyncStorage.getItem(CAT_LIMITS_KEY);
      const storedSavingsRate = await AsyncStorage.getItem(SAVINGS_RATE_KEY);
      const storedTheme = await AsyncStorage.getItem(THEME_KEY);

      if (storedTheme !== null) setIsDarkMode(storedTheme === 'dark');
      if (storedLimit !== null) setMonthlyLimit(storedLimit);
      if (storedSavingsRate !== null) setSavingsRate(parseFloat(storedSavingsRate));
      if (storedCatLimits !== null) setCategoryLimits(JSON.parse(storedCatLimits));

      let migrated: Transaction[] = [];
      const currentMonth = new Date().toISOString().slice(0, 7);
      const todayStr = new Date().toISOString().split('T')[0];

      if (storedData !== null) {
        const parsed = JSON.parse(storedData);
        migrated = parsed.map((t: any) => ({
          id: t.id,
          text: t.text,
          amount: Math.abs(t.amount),
          category: t.category,
          type: t.type || (t.amount < 0 ? 'expense' : 'income'),
          date: t.date || todayStr,
          isRecurring: t.isRecurring || false,
        }));
      }

      const uniqueRecurring = new Map<string, Transaction>();
      migrated
        .filter(t => t.isRecurring && t.type === 'expense')
        .forEach(t => uniqueRecurring.set(t.text + t.category, t));

      let dataChanged = false;
      uniqueRecurring.forEach((template) => {
        const existsThisMonth = migrated.some(
          t => t.text === template.text && t.category === template.category && t.date.startsWith(currentMonth)
        );
        
        if (!existsThisMonth) {
          migrated.unshift({
            ...template,
            id: Date.now().toString() + Math.random().toString(),
            date: todayStr,
          });
          dataChanged = true;
        }
      });

      if (dataChanged) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      }

      setTransactions(migrated);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger les données.');
    }
  };

  const toggleTheme = async () => {
    const nextTheme = !isDarkMode;
    setIsDarkMode(nextTheme);
    await AsyncStorage.setItem(THEME_KEY, nextTheme ? 'dark' : 'light');
  };

  const saveTransactions = async (newTransactions: Transaction[]) => {
    try {
      setTransactions(newTransactions);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newTransactions));
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sauvegarder la transaction.');
    }
  };

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const currentMonthTxs = transactions.filter((t) => t.date.startsWith(currentMonthStr));

  const incomeVal = currentMonthTxs
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);

  const expenseBrute = currentMonthTxs
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);

  const reimbursementVal = currentMonthTxs
    .filter((t) => t.type === 'remboursement')
    .reduce((acc, t) => acc + t.amount, 0);

  const expenseNet = Math.max(0, expenseBrute - reimbursementVal);
  const totalBalance = incomeVal - expenseNet;

  const income = incomeVal.toFixed(2);
  const expense = expenseNet.toFixed(2);
  const total = totalBalance.toFixed(2);

  const limitValue = parseFloat(monthlyLimit) || 0;
  const budgetRatio = limitValue > 0 ? (expenseNet / limitValue) * 100 : 0;

  const expenseBreakdown = CATEGORIES.map((cat, idx) => {
    const catBrute = currentMonthTxs
      .filter((t) => t.category === cat && t.type === 'expense')
      .reduce((acc, t) => acc + t.amount, 0);
    const catReimb = currentMonthTxs
      .filter((t) => t.category === cat && t.type === 'remboursement')
      .reduce((acc, t) => acc + t.amount, 0);
    
    const catTotal = Math.max(0, catBrute - catReimb);
    const percentage = expenseNet > 0 ? (catTotal / expenseNet) * 100 : 0;
    const catLimit = categoryLimits[cat] || 0;

    return {
      category: cat,
      total: catTotal,
      percentage,
      catLimit,
      color: COLORS[idx % COLORS.length],
    };
  }).filter((item) => item.total > 0 || item.catLimit > 0);

  const monthlyStats: Record<string, { in: number, out: number, reimb: number }> = {};
  transactions.forEach(t => {
    const m = t.date.slice(0, 7);
    if (!monthlyStats[m]) monthlyStats[m] = { in: 0, out: 0, reimb: 0 };
    if (t.type === 'income') monthlyStats[m].in += t.amount;
    if (t.type === 'expense') monthlyStats[m].out += t.amount;
    if (t.type === 'remboursement') monthlyStats[m].reimb += t.amount;
  });

  const historyChartData = Object.keys(monthlyStats).sort().slice(-6).map(m => {
    const net = Math.max(0, monthlyStats[m].out - monthlyStats[m].reimb);
    return { month: m, solde: monthlyStats[m].in - net };
  });

  const maxSolde = Math.max(...historyChartData.map(d => Math.abs(d.solde)), 1);

  const addTransaction = () => {
    if (!text.trim() || !amount.trim() || !selectedCategory) return;
    const numericVal = Math.abs(parseFloat(amount.replace(',', '.')));
    if (isNaN(numericVal) || numericVal === 0) return;

    if (type === 'expense') {
      const catLimit = categoryLimits[selectedCategory];
      if (catLimit) {
        const catData = expenseBreakdown.find(c => c.category === selectedCategory);
        const currentSpent = catData ? catData.total : 0;
        if (currentSpent + numericVal > catLimit) {
          Alert.alert('Alerte !', `Dépassement du plafond de la catégorie "${selectedCategory}".`);
        }
      }
    }

    const newTx: Transaction = {
      id: Date.now().toString(),
      text: text.trim(),
      amount: numericVal,
      category: selectedCategory,
      type,
      date: new Date().toISOString().split('T')[0],
      isRecurring: type === 'expense' ? isRecurring : false,
    };

    saveTransactions([newTx, ...transactions]);
    setText('');
    setAmount('');
    setSelectedCategory('');
    setIsRecurring(false);
  };

  const removeTransaction = (id: string) => {
    saveTransactions(transactions.filter((t) => t.id !== id));
  };

  const exportCSV = async () => {
    if (transactions.length === 0) {
      Alert.alert('Export impossible', 'Aucune transaction à exporter.');
      return;
    }

    let csvContent = 'ID;Date;Intitule;Type;Montant;Categorie;Recurrent\n';
    transactions.forEach((t) => {
      const sign = t.type === 'expense' ? '-' : '+';
      const typeLabel = t.type === 'expense' ? 'Depense' : t.type === 'income' ? 'Revenu' : 'Remboursement';
      const recurringStr = t.isRecurring ? 'Oui' : 'Non';
      
      csvContent += `${t.id};${t.date};"${t.text}";${typeLabel};${sign}${t.amount};"${t.category}";${recurringStr}\n`;
    });

    try {
      await Share.share({
        title: 'Export Mon Budget',
        message: csvContent,
      });
    } catch (error) {
      Alert.alert('Erreur', 'Échec du partage du fichier CSV.');
    }
  };

  const exportToPDF = async () => {
    if (transactions.length === 0) {
      Alert.alert('Export impossible', 'Aucune transaction à exporter.');
      return;
    }

    if (Platform.OS === 'web') {
      setShowWebModal(true);
      return;
    }

    const totalRevenus = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const totalDepensesBrutes = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const totalRemboursements = transactions.filter(t => t.type === 'remboursement').reduce((acc, t) => acc + t.amount, 0);
    const totalDepensesNettes = Math.max(0, totalDepensesBrutes - totalRemboursements);
    const soldeFinal = totalRevenus - totalDepensesNettes;

    const htmlRows = transactions.map(t => {
      const sign = t.type === 'expense' ? '-' : '+';
      const typeLabel = t.type === 'expense' ? 'Dépense' : t.type === 'income' ? 'Revenu' : 'Remboursement';
      
      return `
      <tr style="border-bottom: 1px solid #dfe6e9;">
        <td style="padding: 10px;">${t.date}</td>
        <td style="padding: 10px;">${t.text} ${t.isRecurring ? '🔄' : ''}</td>
        <td style="padding: 10px;">${typeLabel}</td>
        <td style="padding: 10px; color: ${t.type === 'expense' ? '#ee5253' : t.type === 'income' ? '#10ac84' : '#74b9ff'};">${sign}${t.amount.toFixed(2)} &euro;</td>
        <td style="padding: 10px;">${t.category}</td>
      </tr>
    `}).join('');

    const htmlContent = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        </head>
        <body style="font-family: Helvetica, Arial, sans-serif; padding: 20px;">
          <h1 style="text-align: center; color: #0984e3;">Rapport Mon Budget</h1>
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="background: #f1f2f6;">
                <th style="padding: 10px; text-align: left;">Date</th>
                <th style="padding: 10px; text-align: left;">Description</th>
                <th style="padding: 10px; text-align: left;">Type</th>
                <th style="padding: 10px; text-align: left;">Montant</th>
                <th style="padding: 10px; text-align: left;">Catégorie</th>
              </tr>
            </thead>
            <tbody>
              ${htmlRows}
            </tbody>
            <tfoot>
              <tr style="background: #eef2f5; font-weight: bold; border-top: 2px solid #0984e3;">
                <td colspan="3" style="padding: 15px; text-align: right; font-size: 16px;">SOLDE TOTAL :</td>
                <td colspan="2" style="padding: 15px; font-size: 16px; color: ${soldeFinal >= 0 ? '#10ac84' : '#ee5253'};">
                  ${soldeFinal >= 0 ? '+' : ''}${soldeFinal.toFixed(2)} &euro;
                </td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Erreur', 'Le partage n\'est pas disponible sur cet appareil.');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de générer le PDF : ' + error);
    }
  };

  const resetAll = () => {
    const performReset = async () => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.clear();
        }
        await AsyncStorage.clear();
        
        setTransactions([]);
        setMonthlyLimit('1200');
        setCategoryLimits({ Alimentation: 300, Loisirs: 150 });
        
        if (Platform.OS === 'web') {
          window.alert('Toutes les données ont été réinitialisées.');
        } else {
          Alert.alert('Succès', 'Toutes les données ont été réinitialisées.');
        }
      } catch (error) {
        if (Platform.OS === 'web') {
          window.alert('Impossible de réinitialiser les données.');
        } else {
          Alert.alert('Erreur', 'Impossible de réinitialiser les données.');
        }
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Veux-tu vraiment effacer toutes les données (transactions, plafonds et limites) ?');
      if (confirmed) {
        performReset();
      }
    } else {
      Alert.alert(
        'Réinitialiser',
        'Veux-tu vraiment effacer toutes les données (transactions, plafonds et limites) ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Effacer',
            style: 'destructive',
            onPress: performReset,
          },
        ]
      );
    }
  };

  const filteredTransactions = activeFilter === 'Toutes'
    ? transactions
    : transactions.filter((t) => t.category === activeFilter);

  const theme = isDarkMode ? darkStyles : lightStyles;

  let cumulativeAngle = 0;
  const pieSlices = expenseBreakdown.filter((item) => item.total > 0).map((item) => {
    const angle = (item.percentage / 100) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle += angle;
    const x1 = 50 + 40 * Math.cos((Math.PI * (startAngle - 90)) / 180);
    const y1 = 50 + 40 * Math.sin((Math.PI * (startAngle - 90)) / 180);
    const x2 = 50 + 40 * Math.cos((Math.PI * (endAngle - 90)) / 180);
    const y2 = 50 + 40 * Math.sin((Math.PI * (endAngle - 90)) / 180);
    const largeArcFlag = angle > 180 ? 1 : 0;
    return { pathData: `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`, color: item.color };
  });

  return (
    <SafeAreaView style={[styles.container, theme.container]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, theme.text]}>Mon Budget (Ce mois)</Text>
          <TouchableOpacity style={[styles.themeToggle, theme.card]} onPress={toggleTheme}>
            <Text style={styles.themeToggleText}>{isDarkMode ? '☀️ Light' : '🌙 Dark'}</Text>
          </TouchableOpacity>
        </View>

        {/* Card Résumé */}
        <View style={[styles.summaryCard, theme.card]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, theme.subText]}>Revenus</Text>
            <Text style={[styles.summaryValue, styles.incomeText]}>+{income} €</Text>
          </View>
          <View style={[styles.divider, theme.divider]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, theme.subText]}>Dépenses nettes</Text>
            <Text style={[styles.summaryValue, styles.expenseText]}>-{expense} €</Text>
          </View>
          <View style={[styles.divider, theme.divider]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, theme.subText]}>Solde</Text>
            <Text style={[styles.summaryValue, theme.text]}>{total} €</Text>
          </View>
        </View>

        {/* Card Objectif Dépenses Mensuel */}
        <View style={[styles.card, theme.card]}>
          <Text style={[styles.sectionTitle, theme.text]}>Objectif de dépense mensuelle</Text>
          <View style={styles.limitRow}>
            <Text style={[styles.limitText, theme.text]}>
              Dépensé : <Text style={styles.boldText}>{expense} €</Text> / {limitValue} €
            </Text>
            <Text style={[styles.limitPercentage, budgetRatio > 100 ? styles.alertText : styles.okText]}>
              {budgetRatio.toFixed(0)}%
            </Text>
          </View>
          <View style={[styles.progressBarBackground, theme.progressBg]}>
            <View style={[styles.progressBarFill, { width: `${Math.min(budgetRatio, 100)}%`, backgroundColor: budgetRatio > 100 ? '#ee5253' : '#10ac84' }]} />
          </View>
        </View>

        {/* Formulaire Transaction */}
        <View style={[styles.card, theme.card]}>
          <Text style={[styles.sectionTitle, theme.text]}>Ajouter une transaction</Text>

          <View style={[styles.typeToggleContainer, theme.toggleBg]}>
            <TouchableOpacity style={[styles.typeButton, type === 'expense' && styles.typeButtonExpense]} onPress={() => setType('expense')}>
              <Text style={[styles.typeButtonText, theme.subText, type === 'expense' && styles.typeButtonTextActive]}>Dépense</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeButton, type === 'income' && styles.typeButtonIncome]} onPress={() => setType('income')}>
              <Text style={[styles.typeButtonText, theme.subText, type === 'income' && styles.typeButtonTextActive]}>Revenu</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeButton, type === 'remboursement' && styles.typeButtonReimb]} onPress={() => setType('remboursement')}>
              <Text style={[styles.typeButtonText, theme.subText, type === 'remboursement' && styles.typeButtonTextActive]}>Remboursement</Text>
            </TouchableOpacity>
          </View>

          <TextInput style={[styles.input, theme.input]} placeholder="Intitulé (ex: Courses)" value={text} onChangeText={setText} placeholderTextColor={isDarkMode ? '#aaa' : '#888'} />
          <TextInput style={[styles.input, theme.input]} placeholder="Montant" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholderTextColor={isDarkMode ? '#aaa' : '#888'} />

          <Text style={[styles.labelCategory, theme.subText]}>Catégorie :</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryContainer}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity key={cat} style={[styles.chip, theme.chip, selectedCategory === cat && styles.chipSelected]} onPress={() => setSelectedCategory(cat)}>
                <Text style={[styles.chipText, theme.text, selectedCategory === cat && styles.chipTextSelected]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {type === 'expense' && (
            <TouchableOpacity style={styles.checkboxContainer} onPress={() => setIsRecurring(!isRecurring)}>
              <View style={[styles.checkbox, isRecurring && styles.checkboxChecked]}>
                {isRecurring && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[theme.text, { fontSize: 14 }]}>Charge fixe mensuelle (répéter)</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.addButton, type === 'expense' ? styles.btnExpense : type === 'income' ? styles.btnIncome : styles.btnReimb]}
            onPress={addTransaction}
          >
            <Text style={styles.buttonText}>Ajouter</Text>
          </TouchableOpacity>
        </View>

        {/* Répartition & Camembert */}
        {expenseBreakdown.length > 0 && (
          <View style={[styles.card, theme.card]}>
            <Text style={[styles.sectionTitle, theme.text]}>Suivi des catégories & plafonds</Text>
            {pieSlices.length > 0 && (
              <View style={styles.chartContainer}>
                <Svg height="140" width="140" viewBox="0 0 100 100">
                  <G>{pieSlices.map((slice, i) => (<Path key={i} d={slice.pathData} fill={slice.color} />))}</G>
                </Svg>
              </View>
            )}
            {expenseBreakdown.map((item) => (
              <View key={item.category} style={styles.catBreakdownRow}>
                <View style={styles.breakdownHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: item.color, marginRight: 8 }} />
                    <Text style={[styles.breakdownCategory, theme.text]}>{item.category}</Text>
                  </View>
                  <Text style={[styles.breakdownAmount, theme.subText]}>{item.total.toFixed(2)} €</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Graphique Évolution 6 mois avec TouchableOpacity */}
        {historyChartData.length > 0 && (
          <View style={[styles.card, theme.card]}>
            <Text style={[styles.sectionTitle, theme.text]}>Évolution (6 derniers mois)</Text>
            <TouchableOpacity 
              activeOpacity={0.7} 
              style={{ alignItems: 'center', marginTop: 10 }}
              onPress={() => setShowEvolutionModal(true)}
            >
              <Svg width={historyChartData.length * 50 + 20} height="120">
                {historyChartData.map((d, i) => {
                  const isPos = d.solde >= 0;
                  const barH = Math.max((Math.abs(d.solde) / maxSolde) * 80, 5);
                  return (
                    <G key={d.month} x={i * 50 + 10}>
                      <Rect y={isPos ? 90 - barH : 90} width={30} height={barH} fill={isPos ? '#10ac84' : '#ee5253'} rx={4} />
                      <SvgText y="110" x="15" fontSize="11" textAnchor="middle" fill={isDarkMode ? '#dcdde1' : '#636e72'}>
                        {d.month.slice(5, 7)}/{d.month.slice(2, 4)}
                      </SvgText>
                    </G>
                  );
                })}
              </Svg>
            </TouchableOpacity>
          </View>
        )}

        {/* Actions / Export & Réinitialisation */}
        <View style={[styles.card, theme.card]}>
          <Text style={[styles.sectionTitle, theme.text]}>Gestion & Exports</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#0984e3', flex: 1, marginRight: 6 }]} onPress={exportCSV}>
              <Text style={styles.actionButtonText}>Export CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#e17055', flex: 1, marginHorizontal: 6 }]} onPress={exportToPDF}>
              <Text style={styles.actionButtonText}>Export PDF</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#d63031', marginTop: 4 }]} onPress={resetAll}>
            <Text style={styles.actionButtonText}>Réinitialiser l'application</Text>
          </TouchableOpacity>
        </View>

        {/* Historique Global */}
        <Text style={[styles.sectionTitle, theme.text]}>Historique</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
          {['Toutes', ...CATEGORIES].map((cat) => (
            <TouchableOpacity key={cat} style={[styles.filterChip, theme.chip, activeFilter === cat && styles.filterChipActive]} onPress={() => setActiveFilter(cat)}>
              <Text style={[styles.filterChipText, theme.subText, activeFilter === cat && styles.filterChipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredTransactions.map((item) => (
          <View key={item.id} style={[styles.historyCard, theme.card]}>
            <View>
              <Text style={[styles.historyText, theme.text]}>
                {item.text} {item.isRecurring ? '🔄' : ''}
              </Text>
              <Text style={[styles.categoryBadge, theme.badge]}>{item.category} • {item.date}</Text>
            </View>
            <View style={styles.rightHistory}>
              <Text style={[styles.historyAmount, item.type === 'expense' ? styles.expenseText : item.type === 'income' ? styles.incomeText : styles.reimbText]}>
                {item.type === 'expense' ? '-' : '+'}{item.amount.toFixed(2)} €
              </Text>
              <TouchableOpacity onPress={() => removeTransaction(item.id)} style={styles.deleteBtn}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Modal Web pour impression PDF */}
      {Platform.OS === 'web' && showWebModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'white', zIndex: 9999, padding: '20px', overflowY: 'auto', fontFamily: 'Helvetica'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', background: '#f1f2f6', padding: '12px', borderRadius: '8px' }}>
            <button onClick={() => setShowWebModal(false)} style={{ background: '#ee5253', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              ✕ Fermer
            </button>
            <button onClick={() => window.print()} style={{ background: '#0984e3', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              🖨️ Enregistrer / Imprimer
            </button>
          </div>
          <h1 style={{ textAlign: 'center', color: '#0984e3' }}>Rapport Mon Budget</h1>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
            <thead>
              <tr style={{ background: '#f1f2f6' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Type</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Montant</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Catégorie</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #dfe6e9' }}>
                  <td style={{ padding: '10px' }}>{t.date}</td>
                  <td style={{ padding: '10px' }}>{t.text} {t.isRecurring ? '🔄' : ''}</td>
                  <td style={{ padding: '10px' }}>{t.type}</td>
                  <td style={{ padding: '10px' }}>{t.type === 'expense' ? '-' : '+'}{t.amount.toFixed(2)} €</td>
                  <td style={{ padding: '10px' }}>{t.category}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#eef2f5', fontWeight: 'bold', borderTop: '2px solid #0984e3' }}>
                <td colSpan={3} style={{ padding: '15px', textAlign: 'right', fontSize: '16px' }}>SOLDE TOTAL :</td>
                <td colSpan={2} style={{ padding: '15px', fontSize: '16px', color: (transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0) - Math.max(0, transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0) - transactions.filter(t => t.type === 'remboursement').reduce((acc, t) => acc + t.amount, 0))) >= 0 ? '#10ac84' : '#ee5253' }}>
                  {((transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0) - Math.max(0, transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0) - transactions.filter(t => t.type === 'remboursement').reduce((acc, t) => acc + t.amount, 0))) >= 0 ? '+' : '')}
                  {(transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0) - Math.max(0, transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0) - transactions.filter(t => t.type === 'remboursement').reduce((acc, t) => acc + t.amount, 0))).toFixed(2)} &euro;
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Modal d'historique de l'évolution 6 mois */}
      <Modal
        visible={showEvolutionModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowEvolutionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, theme.card]}>
            <Text style={[styles.sectionTitle, theme.text, { textAlign: 'center' }]}>Détails des 6 mois</Text>
            
            {historyChartData.slice().reverse().map((d) => (
              <View key={d.month} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.divider.backgroundColor }}>
                <Text style={[theme.text, { fontSize: 16 }]}>{d.month}</Text>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: d.solde >= 0 ? '#10ac84' : '#ee5253' }}>
                  {d.solde > 0 ? '+' : ''}{d.solde.toFixed(2)} €
                </Text>
              </View>
            ))}

            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: '#0984e3', marginTop: 20 }]} 
              onPress={() => setShowEvolutionModal(false)}
            >
              <Text style={styles.actionButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 15 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  themeToggle: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 2 },
  themeToggleText: { fontWeight: 'bold', fontSize: 13 },
  summaryCard: { flexDirection: 'row', borderRadius: 12, padding: 16, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, elevation: 3 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  summaryValue: { fontSize: 15, fontWeight: 'bold' },
  divider: { width: 1, height: '70%' },
  incomeText: { color: '#10ac84' },
  expenseText: { color: '#ee5253' },
  reimbText: { color: '#74b9ff' },
  card: { borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2 },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  limitText: { fontSize: 14 },
  boldText: { fontWeight: 'bold' },
  limitPercentage: { fontWeight: 'bold', fontSize: 14 },
  okText: { color: '#10ac84' },
  alertText: { color: '#ee5253' },
  progressBarBackground: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 },
  typeToggleContainer: { flexDirection: 'row', borderRadius: 8, padding: 4, marginBottom: 12 },
  typeButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  typeButtonExpense: { backgroundColor: '#ee5253' },
  typeButtonIncome: { backgroundColor: '#10ac84' },
  typeButtonReimb: { backgroundColor: '#74b9ff' },
  typeButtonText: { fontWeight: 'bold', fontSize: 12 },
  typeButtonTextActive: { color: '#ffffff' },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 10 },
  labelCategory: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  categoryContainer: { flexDirection: 'row', marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1 },
  chipSelected: { backgroundColor: '#0984e3', borderColor: '#0984e3' },
  chipText: { fontSize: 13, fontWeight: '500' },
  chipTextSelected: { color: '#ffffff', fontWeight: 'bold' },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 12 },
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: { width: 22, height: 22, borderWidth: 2, borderColor: '#0984e3', borderRadius: 4, marginRight: 8, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#0984e3' },
  checkmark: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  addButton: { padding: 14, borderRadius: 8, alignItems: 'center' },
  btnExpense: { backgroundColor: '#ee5253' },
  btnIncome: { backgroundColor: '#10ac84' },
  btnReimb: { backgroundColor: '#74b9ff' },
  buttonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  actionButton: { padding: 12, borderRadius: 8, alignItems: 'center' },
  actionButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  chartContainer: { alignItems: 'center', marginVertical: 10 },
  catBreakdownRow: { marginBottom: 10 },
  breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownCategory: { fontSize: 14, fontWeight: '600' },
  breakdownAmount: { fontSize: 13, fontWeight: '500' },
  filterContainer: { flexDirection: 'row', marginBottom: 14 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, marginRight: 8 },
  filterChipActive: { backgroundColor: '#0984e3', borderColor: '#0984e3' },
  filterChipText: { fontSize: 13 },
  filterChipTextActive: { color: '#ffffff', fontWeight: 'bold' },
  historyCard: { borderRadius: 10, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, elevation: 1 },
  historyText: { fontSize: 16, fontWeight: '600' },
  categoryBadge: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start', marginTop: 4 },
  rightHistory: { flexDirection: 'row', alignItems: 'center' },
  historyAmount: { fontSize: 15, fontWeight: 'bold', marginRight: 10 },
  deleteBtn: { backgroundColor: '#ff7675', width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  deleteText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', borderRadius: 12, padding: 20, elevation: 5 },
});

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#f5f6fa' },
  card: { backgroundColor: '#ffffff' },
  text: { color: '#2d3436' },
  subText: { color: '#636e72' },
  divider: { backgroundColor: '#e1e2e6' },
  input: { backgroundColor: '#f8f9fa', borderColor: '#dfe6e9', color: '#2d3436' },
  progressBg: { backgroundColor: '#f1f2f6' },
  chip: { backgroundColor: '#f1f2f6', borderColor: '#dfe6e9' },
  badge: { backgroundColor: '#f1f2f6', color: '#636e72' },
  toggleBg: { backgroundColor: '#f1f2f6' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#1e272e' },
  card: { backgroundColor: '#2d3436' },
  text: { color: '#f5f6fa' },
  subText: { color: '#dcdde1' },
  divider: { backgroundColor: '#485460' },
  input: { backgroundColor: '#3d3d3d', borderColor: '#485460', color: '#ffffff' },
  progressBg: { backgroundColor: '#485460' },
  chip: { backgroundColor: '#3d3d3d', borderColor: '#485460' },
  badge: { backgroundColor: '#485460', color: '#dcdde1' },
  toggleBg: { backgroundColor: '#3d3d3d' },
});