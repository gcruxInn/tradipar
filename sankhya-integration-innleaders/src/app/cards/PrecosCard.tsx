import React, { useEffect, useState, useRef, useCallback } from "react";
import {
    Text,
    Flex,
    LoadingSpinner,
    Alert,
    hubspot,
    Box,
    Divider,
    Tooltip,
    NumberInput,
    Button,
    Tag,
    Table,
    TableBody,
    TableRow,
    TableCell,
    TableHead,
    TableHeader,
    Heading,
    Statistics,
    StatisticsItem,
    StatisticsTrend,
    // Accordion, // Accordion removed in favor of Tabs
    Select,
    Modal,
    ModalBody,
    ModalFooter,
    Dropdown,
    Icon,
    Link,
    Input,
    SearchInput,
    StepIndicator,
    Tabs,
    Tab,
    Tile,
} from "@hubspot/ui-extensions";

interface ItemData {
    id: string;
    name: string;
    codProd: string;
    quantity: number;
    prices: { pv1: number | null; pv2: number | null; pv3: number | null };
    stock: number;
    stockContext?: string;
    stockOther?: number;
    stockOtherContext?: string;
    sankhyaControle?: string;
    sankhyaProfitability?: number;
    currentPrice?: number | null;
}

interface QuoteStatus {
    hasQuote: boolean;
    nunota: number | null;
    isConfirmed: boolean;
    isRentavel: boolean;
    buttonAction: string;
    buttonLabel: string;
    profitability?: Profitability;
    profitabilityError?: string;
    statusNota?: string;
}

interface Profitability {
    nunota: number;
    faturamento: number;
    custoMercadoriaVendida: number;
    gastoVariavel: number;
    gastoFixo: number;
    lucro: number;
    margemContribuicao: number;
    percentLucro: number;
    percentMC: number;
    percentCMV: number;
    percentGV: number;
    percentGF: number;
    isRentavel: boolean;
    qtdItens: number;
    itemProfitabilities?: any[];
}

interface PrecosResponse {
    items: ItemData[];
    currentAmount: string;
    currentStage: string;
    stageLabel?: string;
    codEmp: string | number;
    codParceiro?: string | number;
}

hubspot.extend<'crm.record.tab'>(({ context, actions }) => (
    <PrecosCard
        context={context}
        onRefreshProperties={actions.refreshObjectProperties}
        actions={actions}
    />
));

interface PrecosCardProps {
    context: {
        crm: {
            objectId: number;
            objectType?: string;
        };
    };
    onRefreshProperties: () => void;
}

const PrecosCard = ({ context, onRefreshProperties, actions }: PrecosCardProps & { actions: any }) => {
    // DEBUG: Inspect available actions
    useEffect(() => console.log("[DEBUG] Available Actions:", Object.keys(actions || {})), [actions]);

    const [data, setData] = useState<PrecosResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [missingData, setMissingData] = useState<any>(null);

    // Performance Control
    const isFetching = useRef(false);
    const debounceTimer = useRef<any | null>(null);

    // Amount State
    const [amount, setAmount] = useState<number | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveWarning, setSaveWarning] = useState<string | null>(null);

    // Conversion State
    const [converting, setConverting] = useState(false);
    const [convertError, setConvertError] = useState<string | null>(null);
    const [convertSuccess, setConvertSuccess] = useState(false);

    // Quote Workflow State
    const [quoteStatus, setQuoteStatus] = useState<QuoteStatus | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [quoteSuccess, setQuoteSuccess] = useState<string | null>(null);

    // Rentabilidade Alert State
    const [rentabMessage, setRentabMessage] = useState<{ title: string, message: string, variant: "success" | "warning" | "danger" | "info" } | null>(null);

    const handleViewRentabilidade = (item: ItemData) => {
        const actualRentab = optimisticProfitabilities[item.id] !== undefined ? optimisticProfitabilities[item.id] : item.sankhyaProfitability;
        if (actualRentab === undefined) {
            setRentabMessage({ title: `Margem Pendente: ${item.name}`, message: "Como houve alterações neste item, você deve primeiro clicar em '🔄 Sincronizar com ERP' para que o Sankhya recalcule o custo efetivo e os impostos que determinam sua rentabilidade individual.", variant: "warning" });
        } else {
            const isRentavel = actualRentab >= 0;
            setRentabMessage({ title: `Rentabilidade: ${item.name}`, message: `Margem do item: ${actualRentab.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`, variant: isRentavel ? "success" : "warning" });
        }
    };


    // Sync State
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ message?: string, success: boolean } | null>(null);

    // Batch Control State
    const [availableControls, setAvailableControls] = useState<Record<string, { controle: string, saldo: number }[]>>({});

    // Navigation State (Hybrid UI)
    const [currentStep, setCurrentStep] = useState(0); // 0: Handshake, 1: Items, 2: Checkout
    const [itemsTab, setItemsTab] = useState("list"); // "list" | "add"

    const fetchControlsForProduct = async (codProd: string, overrideCodEmp?: string | number) => {
        const targetCodEmp = overrideCodEmp !== undefined ? overrideCodEmp : (data?.codEmp || "");
        const cacheKey = `${codProd}-${targetCodEmp}`;

        if (availableControls[cacheKey]) return;

        try {
            const resp = await hubspot.fetch(`https://api.gcrux.com/hubspot/products/controls/${codProd}?codEmp=${targetCodEmp}`);
            const res = await resp.json();
            if (res.success) {
                setAvailableControls(prev => ({ ...prev, [cacheKey]: res.controls }));
            }
        } catch (e) { console.error("Error fetching controls", e); }
    };

    // Auto-select single batch via Effect to avoid scope issues
    useEffect(() => {
        if (!data?.items) return;
        data.items.forEach(item => {
            const currentCodEmp = data?.codEmp || "";
            const cacheKey = `${item.codProd}-${currentCodEmp}`;
            const controls = availableControls[cacheKey];
            if (controls && controls.length === 1 && !item.sankhyaControle) {
                const singleControl = controls[0].controle;
                handleUpdateItemControl(item.id, singleControl);
            }
        });
    }, [availableControls]);

    // Custom Price State
    const [customPriceItemId, setCustomPriceItemId] = useState<string | null>(null);
    const [customPriceValue, setCustomPriceValue] = useState<number | undefined>();
    const [optimisticProfitabilities, setOptimisticProfitabilities] = useState<Record<string, number>>({});
    const [customUnitPriceValue, setCustomUnitPriceValue] = useState<number | undefined>(undefined);

    // Selected prices per item
    const [selectedPrices, setSelectedPrices] = useState<Record<string, number>>({});
    const [selectedPriceTypes, setSelectedPriceTypes] = useState<Record<string, string>>({});
    const [customPriceDisplayMode, setCustomPriceDisplayMode] = useState<Record<string, 'unit' | 'total'>>({});

    // Auto-update Amount when selectedPrices change
    useEffect(() => {
        const total = Object.values(selectedPrices).reduce((a, b) => a + b, 0);
        if (total > 0) {
            setAmount(total);
        }
    }, [selectedPrices]);

    const [duplicatingItemId, setDuplicatingItemId] = useState<string | null>(null);

    // Add Item State
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [addQty, setAddQty] = useState(1);
    const [addingItem, setAddingItem] = useState(false);

    // Calculate Totals for display
    const totals = React.useMemo(() => {
        if (!data?.items) return { pv1: 0, pv2: 0, pv3: 0 };
        return data.items.reduce((acc, item) => ({
            pv1: acc.pv1 + ((item.prices.pv1 || 0) * item.quantity),
            pv2: acc.pv2 + ((item.prices.pv2 || 0) * item.quantity),
            pv3: acc.pv3 + ((item.prices.pv3 || 0) * item.quantity),
        }), { pv1: 0, pv2: 0, pv3: 0 });
    }, [data]);

    // Sincroniza Rentabilidade Real do Sankhya com a Memória Local dos Itens
    useEffect(() => {
        if (quoteStatus && quoteStatus.profitability && quoteStatus.profitability.itemProfitabilities && data?.items) {
            setOptimisticProfitabilities(prev => {
                const newRentabs = { ...prev };
                const iprofs = [...quoteStatus!.profitability!.itemProfitabilities!]; // Clone to allow consuming items
                let changed = false;
                data.items.forEach(item => {
                    const itemTotal = selectedPrices[item.id] !== undefined ? selectedPrices[item.id] : ((item.currentPrice || 0) * item.quantity);

                    const candidates = iprofs.filter((p: any) => p.codProd === String(item.codProd));
                    if (candidates.length > 0) {
                        let bestMatchIdx = -1;
                        let minDiff = Infinity;

                        candidates.forEach(c => {
                            const diff = Math.abs((c.faturamento || 0) - itemTotal);
                            if (diff < minDiff) {
                                minDiff = diff;
                                bestMatchIdx = iprofs.indexOf(c);
                            }
                        });

                        if (bestMatchIdx !== -1) {
                            const match = iprofs[bestMatchIdx];
                            if (newRentabs[item.id] !== match.percentLucro) {
                                newRentabs[item.id] = match.percentLucro;
                                changed = true;
                            }
                            iprofs.splice(bestMatchIdx, 1); // Consume to prevent duplicates from stealing this row
                        }
                    }
                });
                return changed ? newRentabs : prev;
            });
        }
    }, [quoteStatus?.profitability?.itemProfitabilities, data?.items, selectedPrices]);

    const hasStockIssue = data?.items?.some(i => i.stock < i.quantity) || false;

    const formatCurrency = (value: number | null): string => {
        if (value === null || value === undefined) return "---";
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    };

    const formatPercent = (value: number | undefined): string => {
        if (value === undefined || value === null) return "---";
        return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`;
    };

    // Initial Load
    useEffect(() => {
        const loadInitialData = async () => {
            fetchPrices();
            fetchQuoteStatus();

            // Explicitly fetch company ID to ensure context for stock tags
            try {
                if (actions && actions.fetchCrmObjectProperties) {
                    const props = await actions.fetchCrmObjectProperties(['codemp_sankhya', 'parceiro']);
                    if (props && (props.codemp_sankhya || props.parceiro)) {
                        setData(prev => prev ? { ...prev, codEmp: props.codemp_sankhya, codParceiro: props.parceiro } : { items: [], currentAmount: "0", currentStage: "", codEmp: props.codemp_sankhya, codParceiro: props.parceiro });
                    }
                }
            } catch (e) {
                console.error("Failed to fetch codemp:", e);
            }
        };
        loadInitialData();
    }, [context.crm.objectId]); // removed onRefreshProperties/actions from dependency to avoid loop

    useEffect(() => {
        if (data?.items) {
            data.items.forEach(item => {
                if (item.codProd) {
                    // Fetch stock/controls for BOTH companies to ensure "Emp 2" tag has data
                    fetchControlsForProduct(item.codProd, "1");
                    fetchControlsForProduct(item.codProd, "2");
                }
            });
        }
    }, [data]);

    // Data Hash for Loop Prevention
    const lastDataHash = useRef<string>("");

    const fetchPrices = async () => {
        if (isFetching.current) return;
        isFetching.current = true;

        // Don't clear data immediately to avoid flash, just loading state
        setLoading(true);
        // setError(null); // Keep error visible if any until success

        try {
            // Fetch prices and specific deal properties in parallel
            const [response, props] = await Promise.all([
                hubspot.fetch("https://api.gcrux.com/hubspot/prices/deal", {
                    method: "POST",
                    body: { objectId: context.crm.objectId }
                }),
                actions && actions.fetchCrmObjectProperties
                    ? actions.fetchCrmObjectProperties(['codemp_sankhya', 'parceiro'])
                    : Promise.resolve({})
            ]);

            if (!response.ok) throw new Error(`Erro API: ${response.status}`);
            const result = await response.json();

            if (result && result.status === "SUCCESS") {
                // Use fetched property if available, fallback to backend response
                const activeCodEmp = props?.codemp_sankhya || result.codEmp;
                result.codEmp = activeCodEmp;

                // Simple hash check to stop loop
                const currentHash = JSON.stringify(result.items) + result.currentAmount + activeCodEmp;
                if (currentHash === lastDataHash.current) {
                    setLoading(false);
                    isFetching.current = false;
                    return;
                }
                lastDataHash.current = currentHash;

                setData({ ...result, codParceiro: props?.parceiro || (data && data.codParceiro) });
                setMissingData(null);
                if (result.currentAmount) setAmount(Number(result.currentAmount));

                // Re-calc price types logic
                const initialTypes: Record<string, string> = {};
                const initialPrices: Record<string, number> = {};
                result.items.forEach((item: ItemData) => {
                    const hasValidPrices = (item.prices.pv1 || 0) > 0 || (item.prices.pv2 || 0) > 0 || (item.prices.pv3 || 0) > 0;

                    if (item.currentPrice !== null && item.currentPrice !== undefined) {
                        initialPrices[item.id] = item.currentPrice * item.quantity;

                        if (!hasValidPrices) {
                            initialTypes[item.id] = 'custom';
                        }
                        else if (Math.abs(item.currentPrice - (item.prices.pv1 || 0)) < 0.01) initialTypes[item.id] = 'pv1';
                        else if (Math.abs(item.currentPrice - (item.prices.pv2 || 0)) < 0.01) initialTypes[item.id] = 'pv2';
                        else if (Math.abs(item.currentPrice - (item.prices.pv3 || 0)) < 0.01) initialTypes[item.id] = 'pv3';
                        else initialTypes[item.id] = 'custom';
                    } else if (!hasValidPrices) {
                        // Default to custom if no current price and no valid tables
                        initialTypes[item.id] = 'custom';
                    }
                });
                setSelectedPriceTypes(prev => ({ ...prev, ...initialTypes })); // Merge to keep user selection if valid
                setSelectedPrices(prev => ({ ...prev, ...initialPrices }));
            } else if (result && result.status === "MISSING_DATA") {
                setMissingData(result.details);
                // Even on missing data from backend, update local context properties if available
                if (props?.parceiro || props?.codemp_sankhya) {
                    setData(prev => prev ? { ...prev, codEmp: props.codemp_sankhya || prev.codEmp, codParceiro: props.parceiro || prev.codParceiro } : { items: [], currentAmount: "0", currentStage: "", codEmp: props?.codemp_sankhya, codParceiro: props?.parceiro });
                }
            } else {
                setError(result.error || "Erro ao carregar dados.");
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
            setTimeout(() => { isFetching.current = false; }, 500);
        }
    };

    const fetchQuoteStatus = async () => {
        try {
            const response = await hubspot.fetch(`https://api.gcrux.com/hubspot/quote-status/${context.crm.objectId}`, { method: "GET" });
            if (response.ok) {
                const result = await response.json();
                if (result.success) setQuoteStatus(result.status);
            }
        } catch (err) {
            console.error("Failed to fetch quote status:", err);
        }
    };

    const handleSaveAmount = async (valueOverride?: number) => {
        const val = valueOverride !== undefined ? valueOverride : amount;
        if (val === null || val === undefined) return;
        setSaving(true);
        try {
            const response = await hubspot.fetch("https://api.gcrux.com/hubspot/update/deal", {
                method: "POST",
                body: { objectId: context.crm.objectId, amount: val }
            });
            if (response.ok) {
                setSaveSuccess(true);
                onRefreshProperties(); // Sync HubSpot UI
                fetchQuoteStatus(); // Update Profitability
                setTimeout(() => setSaveSuccess(false), 3000);
            }
        } catch (err: any) {
            setSaveError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleQuantityChange = (itemId: string, newQty: number | undefined) => {
        if (!data || newQty === undefined || newQty < 0) return;
        const updatedItems = data.items.map(item => item.id === itemId ? { ...item, quantity: newQty } : item);
        setData({ ...data, items: updatedItems });
    };

    const handleSaveQuantity = async (itemId: string, newQty: number) => {
        if (!data) return;
        try {
            await hubspot.fetch("https://api.gcrux.com/hubspot/update/line-item", {
                method: "POST",
                body: { lineItemId: itemId, quantity: newQty }
            });

            // Recalculate Total
            const item = data.items.find(i => i.id === itemId);
            if (item) {
                const currentTotal = selectedPrices[itemId] || ((item.currentPrice || 0) * item.quantity);
                const unitPrice = item.quantity > 0 ? currentTotal / item.quantity : 0;
                const newItemTotal = unitPrice * newQty;

                const newGlobalTotal = data.items.reduce((sum, curr) => {
                    if (curr.id === itemId) return sum + newItemTotal;
                    return sum + (selectedPrices[curr.id] || (curr.currentPrice || 0) * curr.quantity);
                }, 0);

                setSelectedPrices(prev => ({ ...prev, [itemId]: newItemTotal }));
                setAmount(newGlobalTotal);
                handleSaveAmount(newGlobalTotal);
            }
            onRefreshProperties(); // Sync HubSpot UI
        } catch (err) {
            console.error(err);
        }
    };

    const handleApplyItemPrice = async (itemId: string, unitPrice: number, forceType?: string) => {
        if (!data) return;
        const item = data.items.find(i => i.id === itemId);
        if (!item) return;
        const newItemTotal = unitPrice * item.quantity;
        setSelectedPrices(prev => ({ ...prev, [itemId]: newItemTotal }));

        // Optimistic Profitability Update
        const oldPrice = item.currentPrice || 0;
        const oldRentab = item.sankhyaProfitability || 0;
        if (oldPrice > 0) {
            const estimatedCost = oldPrice * (1 - (oldRentab / 100));
            const newRentab = unitPrice > 0 ? ((unitPrice - estimatedCost) / unitPrice) * 100 : 0;
            setOptimisticProfitabilities(prev => ({ ...prev, [itemId]: newRentab }));
        }

        // Calculate and Save new Global Total immediately
        const newGlobalTotal = data.items.reduce((sum, curr) => {
            if (curr.id === itemId) return sum + newItemTotal;
            return sum + (selectedPrices[curr.id] || (curr.currentPrice || 0) * curr.quantity);
        }, 0);
        setAmount(newGlobalTotal);
        handleSaveAmount(newGlobalTotal);

        let type = 'custom';
        if (forceType) {
            type = forceType;
        } else {
            if (Math.abs(unitPrice - (item.prices.pv1 || 0)) < 0.01) type = 'pv1';
            else if (Math.abs(unitPrice - (item.prices.pv2 || 0)) < 0.01) type = 'pv2';
            else if (Math.abs(unitPrice - (item.prices.pv3 || 0)) < 0.01) type = 'pv3';
        }
        setSelectedPriceTypes(prev => ({ ...prev, [itemId]: type }));

        try {
            await hubspot.fetch("https://api.gcrux.com/hubspot/update/line-item", {
                method: "POST",
                body: { lineItemId: itemId, price: unitPrice }
            });
            setSaveSuccess(true);
            onRefreshProperties(); // Sync HubSpot UI
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            console.error(err);
        }
        setCustomPriceItemId(null);
    };

    const handleApplyCustomPrice = async () => {
        if (customPriceItemId && customPriceValue !== undefined && data) {
            const item = data.items.find(i => i.id === customPriceItemId);
            if (item && item.quantity > 0) {
                const unitPrice = customPriceValue;
                // Optimistic UI updates are now handled inside handleApplyItemPrice via forceType
                handleApplyItemPrice(customPriceItemId, unitPrice, 'custom');
            }
        }
        setCustomPriceItemId(null);
    };

    const handleApplyAllItemsPV = async (pvKey: "pv1" | "pv2" | "pv3") => {
        if (!data?.items) return;
        let total = 0;
        const newPrices: Record<string, number> = {};
        for (const item of data.items) {
            const unit = item.prices[pvKey] || 0;
            const itemTotal = unit * item.quantity;
            total += itemTotal;
            newPrices[item.id] = itemTotal;
            hubspot.fetch("https://api.gcrux.com/hubspot/update/line-item", {
                method: "POST", body: { lineItemId: item.id, price: unit }
            }).catch(console.error);
        }
        setSelectedPrices(newPrices);
        setAmount(total);
        handleSaveAmount(total);
    };

    const handleQuoteAction = async () => {
        setQuoteLoading(true);
        setQuoteError(null);
        try {
            let endpoint = "";
            let body: any = { dealId: context.crm.objectId };
            if (!quoteStatus?.hasQuote) endpoint = "https://api.gcrux.com/hubspot/create-quote";
            else if (quoteStatus.buttonAction === "CONFIRM_QUOTE") {
                endpoint = "https://api.gcrux.com/hubspot/confirm-quote";
                body.nunota = quoteStatus.nunota;
            } else if (quoteStatus.buttonAction === "GENERATE_PDF") {
                endpoint = "https://api.gcrux.com/hubspot/confirm-quote";
                body.nunota = quoteStatus.nunota;
                body.forceConfirm = true;
            }
            if (!endpoint) return;
            const resp = await hubspot.fetch(endpoint, { method: "POST", body });
            const res = await resp.json();
            if (res.success) {
                setQuoteSuccess(res.message);
                fetchQuoteStatus();
                onRefreshProperties();
            } else throw new Error(res.error);
        } catch (e: any) { setQuoteError(e.message); }
        finally { setQuoteLoading(false); }
    };

    const handleDuplicateItem = async (lineItemId: string) => {
        setDuplicatingItemId(lineItemId);
        try {
            const resp = await hubspot.fetch("https://api.gcrux.com/hubspot/duplicate-line-item", {
                method: "POST", body: { dealId: context.crm.objectId, lineItemId }
            });
            const res = await resp.json();
            if (res.success && res.newLineItemId) {
                // Herança de Rentabilidade: Copia da memória (optimistic) ou do item original para resolver bug visual do item clonado 'sem tabela/rentabilidade'
                setOptimisticProfitabilities(prev => {
                    const originalProfitability = prev[lineItemId] !== undefined
                        ? prev[lineItemId]
                        : (data?.items.find(i => i.id === lineItemId)?.sankhyaProfitability);

                    if (originalProfitability !== undefined) {
                        return { ...prev, [res.newLineItemId]: originalProfitability };
                    }
                    return prev;
                });

                onRefreshProperties();
                fetchPrices(); // Re-fetch para sincronizar tudo
            } else if (!res.success) {
                setError(res.error);
            }
        } catch (e: any) { setError(e.message); }
        finally { setDuplicatingItemId(null); }
    };

    const handleSearchProducts = async (q: string) => {
        if (q.length < 3) { setSearchResults([]); return; }
        setSearching(true);
        try {
            const resp = await hubspot.fetch("https://api.gcrux.com/hubspot/products/search", {
                method: "POST", body: { query: q }
            });
            const res = await resp.json();
            if (res.success) setSearchResults(res.products);
        } catch (e) { console.error(e); }
        finally { setSearching(false); }
    };

    const handleAddItem = async () => {
        if (!selectedProduct) return;
        setAddingItem(true);
        try {
            const resp = await hubspot.fetch("https://api.gcrux.com/hubspot/line-item/add", {
                method: "POST",
                body: {
                    dealId: context.crm.objectId,
                    codProd: selectedProduct.codProd,
                    hs_product_id: selectedProduct.hs_product_id,
                    quantity: addQty,
                    name: selectedProduct.name
                }
            });
            const res = await resp.json();
            if (res.success) {
                setSearchResults([]);
                setSearchTerm("");
                setSelectedProduct(null);
                setAddQty(1);
                // Sincronização manual e refresh nativo
                setTimeout(() => {
                    fetchPrices();
                }, 500);
                onRefreshProperties();
            } else setError(res.error);
        } catch (e: any) { setError(e.message); }
        finally { setAddingItem(false); }
    };

    const handleDeleteItem = async (lineItemId: string) => {
        try {
            const resp = await hubspot.fetch(`https://api.gcrux.com/hubspot/line-item/${lineItemId}`, {
                method: "DELETE"
            });
            const res = await resp.json();
            if (res.success) {
                // Atualização manual do estado local para feedback imediato
                setData(prev => {
                    if (!prev) return prev;
                    const newItems = prev.items.filter(i => i.id !== lineItemId);
                    // UX FIX: Se acabou os itens, forçar estado vazio para aparecer a tela "Adicionar Primeiro Item"
                    if (newItems.length === 0) {
                        return { ...prev, items: [] };
                    }
                    return { ...prev, items: newItems };
                });
                onRefreshProperties();
            } else setError(res.error);
        } catch (e: any) { setError(e.message); }
    };

    const handleUpdateItemControl = async (lineItemId: string, control: string) => {
        try {
            const resp = await hubspot.fetch("https://api.gcrux.com/hubspot/line-item/update", {
                method: "POST",
                body: { lineItemId, properties: { sankhya_controle: control } }
            });

            // Optimistic UI: Update local state immediately
            setData(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    items: prev.items.map(i => i.id === lineItemId ? { ...i, sankhyaControle: control } : i)
                };
            });

            const res = await resp.json();
            if (res.success) {
                fetchPrices();
                onRefreshProperties();
            } else setError(res.error);
        } catch (e: any) { setError(e.message); }
    };

    const handleConvertToOrder = async () => {
        setConverting(true);
        try {
            const resp = await hubspot.fetch("https://api.gcrux.com/hubspot/convert-to-order", {
                method: "POST", body: { objectId: context.crm.objectId }
            });
            const res = await resp.json();
            if (res.success) setConvertSuccess(true);
            else setConvertError(res.error);
        } catch (e: any) { setConvertError(e.message); }
        finally { setConverting(false); }
    };

    const calculateSelectedTotal = (): number => {
        if (!data?.items) return 0;
        return data.items.reduce((sum, item) => sum + (selectedPrices[item.id] || (item.currentPrice || 0) * item.quantity), 0);
    };

    const getSelectedPV = (item: ItemData) => {
        if (selectedPriceTypes[item.id]) return selectedPriceTypes[item.id];
        if (!item.currentPrice) return undefined;
        if (Math.abs(item.currentPrice - (item.prices.pv1 || 0)) < 0.01) return "pv1";
        if (Math.abs(item.currentPrice - (item.prices.pv2 || 0)) < 0.01) return "pv2";
        if (Math.abs(item.currentPrice - (item.prices.pv3 || 0)) < 0.01) return "pv3";
        return "custom";
    };

    const handleGenerateHeader = async () => {
        setLoading(true);
        try {
            const resp = await hubspot.fetch("https://api.gcrux.com/hubspot/generate-header", {
                method: "POST", body: { dealId: context.crm.objectId }
            });
            const res = await resp.json();
            if (res.success) { fetchPrices(); fetchQuoteStatus(); onRefreshProperties(); }
            else setError(res.error);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };

    const renderAddItemContent = () => (
        <Flex direction="column" gap="md">
            <Flex direction="column" gap="sm">
                <Select
                    label="Buscar Produto"
                    name="prod-search"
                    placeholder="Digite para buscar..."
                    options={searchResults.map((p: any) => ({
                        label: `[${p.codProd}] ${p.name}${p.controle ? ` (Controle: ${p.controle})` : ""}`,
                        value: p.codProd.toString()
                    }))}
                    onInput={(val: string) => {
                        setSearchTerm(val);
                        handleSearchProducts(val);
                    }}
                    onChange={(val: any) => {
                        if (val) {
                            const prod = searchResults.find((r: any) => r.codProd.toString() === val.toString());
                            setSelectedProduct(prod);
                        }
                    }}
                />

                {searchTerm.length >= 3 && !searching && searchResults.length === 0 && (
                    <Alert title="Sem resultados" variant="warning">A busca por "{searchTerm}" não retornou produtos no Sankhya.</Alert>
                )}

                {searching && <LoadingSpinner label="Buscando produtos..." size="sm" />}

                <Flex direction="row" gap="sm" align="end">
                    <Box flex={1}>
                        <NumberInput
                            label="Quantidade"
                            name="add-qty"
                            value={addQty}
                            onChange={(v: number | undefined) => setAddQty(v || 1)}
                        />
                    </Box>
                    <Button
                        variant="primary"
                        onClick={handleAddItem}
                        disabled={addingItem || !selectedProduct}
                    >
                        {addingItem ? "Adicionando..." : "✅ Confirmar Adição"}
                    </Button>
                </Flex>
            </Flex>
            {selectedProduct && (
                <Alert title="Produto Selecionado" variant="info">
                    <Text format={{ fontWeight: "bold" }}>{selectedProduct.name}</Text> pronto para ser adicionado.
                </Alert>
            )}
        </Flex>
    );

    // ===========================================
    // HYBRID UI RENDER HELPERS
    // ===========================================

    // --- STEP 1: CONEXÃO (Handshake) ---
    const renderStep1 = () => {
        const hasBudget = !!quoteStatus?.nunota;

        return (
            <Flex direction="column" gap="md">
                <Tile>
                    <Flex direction="column" gap="md">
                        <Text format={{ fontWeight: "bold" }}>🔗 Status da Conexão Sankhya</Text>


                        <Flex gap="sm" wrap="wrap">
                            <Tag variant={quoteStatus?.nunota ? "success" : "warning"}>
                                Status: {quoteStatus?.nunota
                                    ? `Confirmado (Nota ${quoteStatus.nunota})`
                                    : (hasBudget ? "Em Negociação" : "Iniciando Negociação")}
                            </Tag>
                        </Flex>


                        {!data?.codParceiro ? (
                            <Alert title="Parceiro Ausente" variant="warning">
                                Este negócio não tem um "Parceiro" / Empresa vinculado ou a propriedade "parceiro" não está preenchida. Adicione uma empresa associada a este negócio ou preencha a propriedade "parceiro" com o código do parceiro.
                            </Alert>
                        ) : !hasBudget ? (
                            <Alert title="Conexão Pendente" variant="error">
                                Este negócio ainda não possui um orçamento iniciado no Sankhya.
                            </Alert>
                        ) : (!data?.items || data.items.length === 0) ? (
                            <Alert title="Orçamento Vazio" variant="info">
                                Lista de itens vazia ou não sincronizada. Adicione itens para calcular.
                            </Alert>
                        ) : (
                            <Alert title="Conexão Ativa" variant="success">
                                Nro. Único Vinculado: <Text inline={true} format={{ fontWeight: "bold" }}>{quoteStatus?.nunota}</Text>
                            </Alert>
                        )}

                        {!hasBudget && (
                            <Button onClick={handleGenerateHeader} variant="primary">
                                Iniciar Orçamento (ERP)
                            </Button>
                        )}
                    </Flex>
                </Tile>

                {hasBudget && !!data?.codParceiro && data?.items && data.items.length > 0 && (
                    <Button onClick={() => setCurrentStep(1)} variant="primary">
                        Avançar para Produtos &rarr;
                    </Button>
                )}
            </Flex>
        );
    };

    const handleSyncToERP = async () => {
        if (!quoteStatus?.nunota) return;

        setSyncing(true);
        setSyncResult(null);

        try {
            const resp = await hubspot.fetch("https://api.gcrux.com/hubspot/sync-quote-items", {
                method: "POST",
                body: { dealId: context.crm.objectId, nunota: quoteStatus.nunota }
            });

            const res = await resp.json();

            if (res.success) {
                setSyncResult({ success: true, message: "Sincronizado com sucesso!" });
                fetchPrices();
                setTimeout(() => setSyncResult(null), 3000);
            } else {
                setSyncResult({ success: false, message: res.error || "Erro na sincronização." });
            }
        } catch (e: any) {
            setSyncResult({ success: false, message: e.message });
        } finally {
            setSyncing(false);
        }
    };

    // --- STEP 2: GESTÃO DE PRODUTOS (Items Hub) ---
    const handleRowClickSync = async (e: React.MouseEvent) => {
        // Ignora se o clique for em botões, inputs, select (prevenir cliques na própria linha acionando inputs)
        if ((e.target as HTMLElement).closest('button, input, select')) return;

        if (!quoteStatus?.nunota || syncing) return;

        // Background silent sync
        hubspot.fetch("https://api.gcrux.com/hubspot/sync-quote-items", {
            method: "POST",
            body: { dealId: context.crm.objectId, nunota: quoteStatus.nunota }
        }).then((resp) => resp.json()).then((res) => {
            if (res.success) fetchPrices();
        }).catch(err => console.error(err));
    };

    const renderStep2 = () => {
        return (
            <Flex direction="column" gap="large">
                <Tabs variant="enclosed" selected={itemsTab} onSelectedChange={setItemsTab}>
                    <Tab tabId="list" title="📝 Carrinho">
                        <Box>
                            <Flex direction="row" gap="sm" justify="between" align="center" wrap="wrap">
                                <Box>
                                    <Text format={{ fontWeight: "bold" }}>Itens no Carrinho: {data?.items?.length || 0}</Text>
                                </Box>
                                <Flex gap="sm">
                                    {quoteStatus?.nunota && !quoteStatus.isConfirmed && (
                                        <Button size="sm" onClick={handleSyncToERP} disabled={syncing} variant="secondary">
                                            {syncing ? "Sincronizando..." : "🔄 Sincronizar com ERP"}
                                        </Button>
                                    )}
                                    <Button size="sm" onClick={() => handleApplyAllItemsPV("pv1")}>Aplicar PV1 em Tudo</Button>
                                </Flex>
                            </Flex>
                            {syncResult && (
                                <Alert title={syncResult.success ? "Sucesso" : "Erro"} variant={syncResult.success ? "success" : "danger"}>
                                    {syncResult.message}
                                </Alert>
                            )}
                            {rentabMessage && (
                                <Box>
                                    <Alert title={rentabMessage.title} variant={rentabMessage.variant}>
                                        {rentabMessage.message}
                                    </Alert>
                                    <Divider distance="small" />
                                </Box>
                            )}
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableHeader width="auto">Ações</TableHeader>
                                        <TableHeader width={100}>Qtd</TableHeader>
                                        <TableHeader width="auto">Produto</TableHeader>
                                        <TableHeader width="auto">Lote</TableHeader>
                                        <TableHeader width="auto">Preço</TableHeader>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {data?.items?.length === 0 && (
                                        <TableRow>
                                            <TableCell>
                                                <EmptyState />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {data?.items?.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <Dropdown buttonText="Opções" variant="secondary" buttonSize="xs">
                                                    <Dropdown.ButtonItem onClick={() => handleViewRentabilidade(item)}>📊 Ver Rentabilidade</Dropdown.ButtonItem>
                                                    <Dropdown.ButtonItem onClick={() => handleDuplicateItem(item.id)}>📑 Duplicar</Dropdown.ButtonItem>
                                                    <Dropdown.ButtonItem onClick={() => handleDeleteItem(item.id)}>🗑️ Excluir</Dropdown.ButtonItem>
                                                </Dropdown>
                                            </TableCell>
                                            <TableCell>
                                                <NumberInput
                                                    label=""
                                                    name={`q-${item.id}`}
                                                    value={item.quantity}
                                                    onChange={(v) => handleQuantityChange(item.id, v)}
                                                    onBlur={() => handleSaveQuantity(item.id, item.quantity)}
                                                    min={0}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Flex direction="column">
                                                    <Text format={{ fontWeight: "bold" }}>
                                                        {item.name}
                                                        <Text inline={true} variant="microcopy"> Cód: {item.codProd}</Text>
                                                    </Text>
                                                    <Text variant="microcopy">Disp: {item.stock + (item.stockOther || 0)}</Text>
                                                    <Flex direction="row" gap="xs" wrap="wrap">
                                                        {item.stock < item.quantity && (
                                                            <Tag variant="warning">⚠️ {item.stock}</Tag>
                                                        )}
                                                        {(() => {
                                                            const currentEmp = String(data?.codEmp);
                                                            const otherEmp = currentEmp === "1" ? "2" : "1";
                                                            const otherLabel = currentEmp === "1" ? "Emp 2" : "Emp 1";

                                                            // Calculate stock from loaded controls for the OTHER company
                                                            const otherControls = availableControls[`${item.codProd}-${otherEmp}`];
                                                            const calculatedStockOther = otherControls
                                                                ? otherControls.reduce((acc, curr) => acc + curr.saldo, 0)
                                                                : (item.stockOther || 0); // Fallback to backend value if not loaded yet? Or 0.

                                                            return (
                                                                <Tag>{otherLabel}: {calculatedStockOther}</Tag>
                                                            );
                                                        })()}
                                                    </Flex>
                                                </Flex>
                                            </TableCell>
                                            <TableCell>
                                                {availableControls[`${item.codProd}-${data?.codEmp || ""}`] ? (
                                                    <Select
                                                        name={`lote-${item.id}`}
                                                        options={availableControls[`${item.codProd}-${data?.codEmp || ""}`]
                                                            .filter((c: any) => !data?.codEmp || !c.codEmp || String(c.codEmp) === String(data?.codEmp))
                                                            .map(c => ({
                                                                label: `${c.controle} (${c.saldo})`,
                                                                value: c.controle
                                                            }))}
                                                        value={item.sankhyaControle || ""}
                                                        onChange={(val) => handleUpdateItemControl(item.id, val as string)}
                                                        placeholder="Selecione..."
                                                    />
                                                ) : <LoadingSpinner size="sm" label="Carregando..." />}
                                            </TableCell>
                                            <TableCell>
                                                {customPriceItemId === item.id ? (
                                                    <Flex direction="row" gap="sm" align="center">
                                                        <NumberInput
                                                            label=""
                                                            name={`custom-price-${item.id}`}
                                                            value={customPriceValue}
                                                            onChange={(val) => setCustomPriceValue(val)}
                                                            precision={2}
                                                        />
                                                        <Button
                                                            onClick={handleApplyCustomPrice}
                                                            variant="primary"
                                                            size="xs"
                                                        >
                                                            ✅
                                                        </Button>
                                                        <Button
                                                            onClick={() => setCustomPriceItemId(null)}
                                                            variant="secondary"
                                                            size="xs"
                                                        >
                                                            ❌
                                                        </Button>
                                                    </Flex>
                                                ) : (
                                                    <Select
                                                        label=""
                                                        name={`pv-${item.id}`}
                                                        value={getSelectedPV(item)}
                                                        options={[
                                                            { label: (item.prices.pv1 || 0) > 0 ? `PV1: ${formatCurrency(item.prices.pv1)}` : "PV1: Sem Tabela", value: "pv1" },
                                                            { label: (item.prices.pv2 || 0) > 0 ? `PV2: ${formatCurrency(item.prices.pv2)}` : "PV2: Sem Tabela", value: "pv2" },
                                                            { label: (item.prices.pv3 || 0) > 0 ? `PV3: ${formatCurrency(item.prices.pv3)}` : "PV3: Sem Tabela", value: "pv3" },
                                                            ...(getSelectedPV(item) === 'custom' ? [{ label: `Edit: ${formatCurrency(selectedPrices[item.id] || ((item.currentPrice || 0) * item.quantity))}`, value: "custom" }] : []),
                                                            { label: "✏️ Definir Valor...", value: "edit_custom" }
                                                        ]}
                                                        onChange={(val) => {
                                                            if (val === "pv1") handleApplyItemPrice(item.id, item.prices.pv1 || 0);
                                                            else if (val === "pv2") handleApplyItemPrice(item.id, item.prices.pv2 || 0);
                                                            else if (val === "pv3") handleApplyItemPrice(item.id, item.prices.pv3 || 0);
                                                            else if (val === "edit_custom") {
                                                                setCustomPriceItemId(item.id);
                                                                setCustomPriceValue(selectedPrices[item.id] || (item.currentPrice ? item.currentPrice * item.quantity : 0));
                                                            }
                                                        }}
                                                    />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {quoteStatus?.profitability ? (
                                <Box>
                                    <Divider distance="large" />
                                    <Flex direction="column">
                                        <Flex direction="row" justify="center" gap="small">
                                            <Heading>Análise de Rentabilidade</Heading>
                                            {quoteStatus.profitability.isRentavel ? (
                                                <Tag variant="success">✅ Rentável</Tag>
                                            ) : (
                                                <Tag variant="error">❌ Prejuízo</Tag>
                                            )}
                                        </Flex>
                                    </Flex>
                                    <Divider distance="lg" />
                                    <Statistics>
                                        <StatisticsItem label="Faturamento" number={formatCurrency(quoteStatus.profitability.faturamento)}>
                                        </StatisticsItem>
                                        <StatisticsItem label="Margem Contribuição" number={formatCurrency(quoteStatus.profitability.margemContribuicao)}>
                                            <StatisticsTrend
                                                direction={quoteStatus.profitability.percentMC >= 0 ? "increase" : "decrease"}
                                                value={formatPercent(quoteStatus.profitability.percentMC)}
                                            />
                                        </StatisticsItem>
                                        <StatisticsItem label="Lucro Líquido" number={formatCurrency(quoteStatus.profitability.lucro)}>
                                            <StatisticsTrend
                                                direction={quoteStatus.profitability.isRentavel ? "increase" : "decrease"}
                                                value={formatPercent(quoteStatus.profitability.percentLucro)}
                                            />
                                        </StatisticsItem>
                                    </Statistics>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableHeader>Custo</TableHeader>
                                                <TableHeader align="right">Valor (R$)</TableHeader>
                                                <TableHeader align="right">%</TableHeader>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            <TableRow>
                                                <TableCell>CMV (Custo Mercadoria)</TableCell>
                                                <TableCell align="right">{formatCurrency(quoteStatus.profitability.custoMercadoriaVendida)}</TableCell>
                                                <TableCell align="right">{formatPercent(quoteStatus.profitability.percentCMV)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell>Gasto Variável</TableCell>
                                                <TableCell align="right">{formatCurrency(quoteStatus.profitability.gastoVariavel)}</TableCell>
                                                <TableCell align="right">{formatPercent(quoteStatus.profitability.percentGV)}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell>Gasto Fixo</TableCell>
                                                <TableCell align="right">{formatCurrency(quoteStatus.profitability.gastoFixo)}</TableCell>
                                                <TableCell align="right">{formatPercent(quoteStatus.profitability.percentGF)}</TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </Box>
                            ) : (
                                <Alert title="Rentabilidade Indisponível" variant="warning">
                                    Sincronize o pedido para visualizar a análise financeira.
                                </Alert>
                            )}
                        </Box>
                    </Tab>
                    <Tab tabId="add" title="➕ Adicionar Itens">
                        <Box>
                            {renderAddItemContent()}
                        </Box>
                    </Tab>
                    {/* Tab 'details' removed */}
                </Tabs>

                {quoteStatus?.profitability && !quoteStatus.profitability.isRentavel && (
                    <Alert title="Negócio com Prejuízo" variant="error">
                        Atenção: Você deve ajustar os preços ou quantidades. O orçamento atual apresenta prejuízo financeiro e está bloqueado para fechamento.
                    </Alert>
                )}
                <Flex gap="sm" justify="between">
                    <Button onClick={() => setCurrentStep(0)} variant="secondary">&larr; Voltar para Conexão</Button>
                    <Button
                        onClick={() => setCurrentStep(2)}
                        variant="primary"
                        disabled={quoteStatus?.profitability && !quoteStatus.profitability.isRentavel}
                    >
                        Ir para Fechamento &rarr;
                    </Button>
                </Flex>
            </Flex>
        );
    };

    // --- STEP 3: FECHAMENTO (Checkout) ---
    const renderStep3 = () => {
        return (
            <Flex direction="column" gap="md">
                <Tile>
                    <Flex direction="column" gap="md" align="center">
                        <Heading>Resumo do Negócio</Heading>
                        <Divider />
                        <Flex gap="xl" justify="center">
                            <Flex direction="column" align="center">
                                <Text variant="microcopy">Total Calculado (Itens)</Text>
                                <Heading>{formatCurrency(amount || 0)}</Heading>
                            </Flex>
                        </Flex>
                        <Divider />
                        <Flex gap="md">
                            {/* Profitability table moved to Step 2 */}
                        </Flex>
                        <Divider />
                        <Flex gap="md">
                            <Button variant="secondary" onClick={() => handleSaveAmount()}>✓ Sincronizar Últimos Valores</Button>

                            {(quoteStatus?.buttonAction === "CONFIRM_QUOTE" || quoteStatus?.buttonAction === "GENERATE_PDF") && (
                                <Button
                                    variant="primary"
                                    onClick={handleQuoteAction}
                                    disabled={quoteLoading}
                                >
                                    {quoteLoading ? "Processando..." : quoteStatus.buttonLabel}
                                </Button>
                            )}
                        </Flex>
                        {saveSuccess && <Alert title="Sucesso" variant="success">Valores sincronizados com o HubSpot!</Alert>}
                        {quoteError && <Alert title="Aviso" variant="warning">{quoteError}</Alert>}
                        {quoteSuccess && <Alert title="Orçamento Confirmado" variant="success">{quoteSuccess}</Alert>}
                    </Flex>
                </Tile>
                <Button onClick={() => setCurrentStep(1)} variant="secondary">&larr; Voltar para Itens</Button>
            </Flex>
        );
    };

    // Empty state helper
    const EmptyState = () => (
        <Flex direction="column" align="center" gap="sm" justify="center" alignSelf="center">
            <Text>O carrinho está vazio.</Text>
            <Button onClick={() => setItemsTab("add")} variant="secondary">Adicionar Item</Button>
        </Flex>
    );

    if (loading) return <LoadingSpinner label="Carregando Hub Comercial..." />;

    if (error) return (
        <Flex direction="column" gap="sm">
            <Alert title="Erro Crítico" variant="error">{error}</Alert>
            <Button onClick={fetchPrices} variant="secondary">Tentar Novamente</Button>
        </Flex>
    );

    return (
        <Flex direction="column" gap="md">
            {/* GLOBAL NAVIGATION */}
            <StepIndicator
                currentStep={currentStep}
                stepNames={['Conexão', 'Gestão de Itens', 'Fechamento']}
            />

            <Divider />

            {/* CONDITIONAL STEP RENDER */}
            {currentStep === 0 && renderStep1()}
            {currentStep === 1 && renderStep2()}
            {currentStep === 2 && renderStep3()}

        </Flex>
    );
};

export default PrecosCard;