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
    isOrderConfirmed?: boolean;
    isRentavel: boolean;
    buttonAction: string;
    buttonLabel: string;
    profitability?: Profitability;
    profitabilityError?: string;
    statusNota?: string;
    nrNota?: string | number;
    nuPedido?: string | number;
    nuUnicoPedido?: string | number;
    nuNfe?: string | number;
    dealtype?: string;
    didUpdateHubSpot?: boolean;
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

const BASE_API_URL = "https://api.gcrux.com";

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
    const autoSyncTimer = useRef<any | null>(null);

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

    // Record Initialization State
    const [recordReady, setRecordReady] = useState(false);

    // Rentabilidade Alert Actions
    const handleViewRentabilidade = (item: ItemData) => {
        const actualRentab = optimisticProfitabilities[item.id] !== undefined ? optimisticProfitabilities[item.id] : item.sankhyaProfitability;
        if (actualRentab === undefined) {
            actions.addAlert({ type: "warning", title: `Margem Pendente: ${item.name}`, message: "Como houve alterações neste item, você deve primeiro clicar em '🔄 Sincronizar com ERP' para que o Sankhya recalcule o custo efetivo e os impostos que determinam sua rentabilidade individual." });
        } else {
            const isRentavel = actualRentab >= 0;
            actions.addAlert({ type: isRentavel ? "success" : "warning", title: `Rentabilidade: ${item.name}`, message: `Margem do item: ${actualRentab.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%` });
        }
    };


    // Sync State
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ message?: string, success: boolean } | null>(null);

    // Auto-sync: schedule ERP sync after price/quantity changes (debounced 2s)
    const scheduleAutoSync = () => {
        if (autoSyncTimer.current) clearTimeout(autoSyncTimer.current);
        autoSyncTimer.current = setTimeout(() => {
            if (quoteStatus?.nunota && !syncing) {
                handleSyncToERP(true); // silent = true
            }
        }, 2000);
    };

    // Cleanup auto-sync timer on unmount + force sync if pending
    useEffect(() => {
        return () => {
            if (autoSyncTimer.current) {
                clearTimeout(autoSyncTimer.current);
                // Fire-and-forget sync: garante que nenhum input é perdido ao fechar o card
                if (quoteStatus?.nunota && context.crm.objectId) {
                    hubspot.fetch(`${BASE_API_URL}/hubspot/sync-quote-items`, {
                        method: "POST",
                        body: { dealId: context.crm.objectId, nunota: quoteStatus.nunota }
                    }).catch(() => { }); // silencioso — componente já está desmontando
                }
            }
        };
    }, [quoteStatus?.nunota, context.crm.objectId]);

    // Batch Control State
    const [availableControls, setAvailableControls] = useState<Record<string, { label: string; value: string; saldo: number; codigoBarras?: string }[]>>({});

    // Navigation State (Hybrid UI)
    const [currentStep, setCurrentStep] = useState(0); // 0: Handshake, 1: Items, 2: Checkout
    const [isTransitioning, setIsTransitioning] = useState(false); // UX transição visual entre steps
    const [itemsTab, setItemsTab] = useState("list"); // "list" | "add"

    // Helper para navegar entre steps com transição visual (500-800ms LoadingSpinner)
    const navigateToStep = (step: number) => {
        setIsTransitioning(true);
        setTimeout(() => {
            setCurrentStep(step);
            setIsTransitioning(false);
        }, 600);
    };

    const fetchControlsForProduct = async (codProd: string, overrideCodEmp?: string | number) => {
        const targetCodEmp = overrideCodEmp !== undefined ? overrideCodEmp : (data?.codEmp || "");
        const cacheKey = `${codProd}-${targetCodEmp}`;

        if (availableControls[cacheKey]) return;

        try {
            const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/products/controls/${codProd}?codEmp=${targetCodEmp}`);
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
                const singleControl = controls[0].value;
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

    // Fase 35: Checkout Sub-steps State
    const [checkoutSubStep, setCheckoutSubStep] = useState(0);
    const [releaseUsers, setReleaseUsers] = useState<{ codusu: number, nome: string, codgrupo?: number, email?: string }[]>([]);
    const [selectedReleaseUser, setSelectedReleaseUser] = useState<number | null>(null);
    const [releasePolling, setReleasePolling] = useState(false);
    const [releaseApproved, setReleaseApproved] = useState(false);
    const [releaseLoading, setReleaseLoading] = useState(false);
    const [releaseEvents, setReleaseEvents] = useState<any[]>([]);
    const [pedidoNuUnico, setPedidoNuUnico] = useState<string | null>(null);
    const [obsInterna, setObsInterna] = useState('');
    const [dealAttachments, setDealAttachments] = useState<any[]>([]);
    const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
    const [fetchingAttachments, setFetchingAttachments] = useState(false);
    const [rotaEntrega, setRotaEntrega] = useState('');
    const [rotaEntrega2, setRotaEntrega2] = useState('');
    const [rotaEntregaOptions, setRotaEntregaOptions] = useState<Array<{label: string; value: string}>>([]);
    const [rotaEntrega2Options, setRotaEntrega2Options] = useState<Array<{label: string; value: string}>>([]);
    const [loadingRotas, setLoadingRotas] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const releaseIntervalRef = useRef<any>(null);
    const hasAutoAdvancedRef = useRef(false);

    // Partial Billing / Evolution State
    const [billableItems, setBillableItems] = useState<any[]>([]);
    const [selectedBillItems, setSelectedBillItems] = useState<Record<number, number>>({}); // sequencia -> quantidade
    const [isPartialBill, setIsPartialBill] = useState(false);
    const [fetchingBillables, setFetchingBillables] = useState(false);

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
            console.log("[HS-HANDSHAKE] Initializing Card for Deal:", context.crm.objectId);

            try {
                if (actions && actions.fetchCrmObjectProperties) {
                    // Force wait for HubSpot properties load before starting pricing logic
                    const props = await actions.fetchCrmObjectProperties(['codemp_sankhya', 'parceiro', 'dealname']);

                    if (props) {
                        setRecordReady(true);
                        // Start backend fetches sequentially
                        fetchPrices();
                        fetchQuoteStatus();

                        // Update local data context with HS props
                        if (props.codemp_sankhya || props.parceiro) {
                            setData(prev => prev ? { ...prev, codEmp: props.codemp_sankhya, codParceiro: props.parceiro } : { items: [], currentAmount: "0", currentStage: "", codEmp: props.codemp_sankhya, codParceiro: props.parceiro });
                        }
                    }
                } else {
                    setRecordReady(true);
                    fetchPrices();
                    fetchQuoteStatus();
                }
            } catch (e) {
                console.error("[HS-HANDSHAKE] Error during record initialization:", e);
                setRecordReady(true);
                fetchPrices();
                fetchQuoteStatus();
            }
        };
        loadInitialData();
    }, [context.crm.objectId]);

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

    // Fetch Deal Attachments (moved to top level to comply with React hook rules)
    const fetchDealAttachments = useCallback(async () => {
        setFetchingAttachments(true);
        try {
            const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/deal/${context.crm.objectId}/attachments`);
            const result = await resp.json();
            if (result.success && result.attachments) {
                setDealAttachments(result.attachments);
            } else {
                setDealAttachments([]);
                console.warn("Nenhum anexo encontrado:", result.error);
            }
        } catch (e) {
            console.error("Erro ao buscar anexos do Deal:", e);
            setDealAttachments([]);
        } finally {
            setFetchingAttachments(false);
        }
    }, [context.crm.objectId]);

    // Load attachments and deal properties when entering checkout sub-step 2 (Preparação)
    useEffect(() => {
        if (currentStep === 2 && checkoutSubStep === 2) {
            fetchDealAttachments();

            // Load existing obs and delivery routes from HubSpot
            if (actions && actions.fetchCrmObjectProperties) {
                actions.fetchCrmObjectProperties(['observacao_interna', 'rota_de_entrega_1', 'rota_de_entrega_2']).then((props: any) => {
                    if (props?.observacao_interna) {
                        setObsInterna(props.observacao_interna);
                    }
                    if (props?.rota_de_entrega_1) {
                        setRotaEntrega(props.rota_de_entrega_1);
                    }
                    if (props?.rota_de_entrega_2) {
                        setRotaEntrega2(props.rota_de_entrega_2);
                    }
                }).catch((err: any) => {
                    console.warn('[PREPARACAO] Could not fetch deal properties:', err);
                });
            }

            // Load available rota options for both fields
            setLoadingRotas(true);
            console.log('[PREPARACAO] Starting to load rota options from:', BASE_API_URL);
            Promise.all([
                hubspot.fetch(`${BASE_API_URL}/hubspot/property-options/rota_de_entrega_1`)
                    .then(resp => {
                        console.log('[PREPARACAO] Rota 1 response received:', resp.status, resp.statusText);
                        return resp.json();
                    }),
                hubspot.fetch(`${BASE_API_URL}/hubspot/property-options/rota_de_entrega_2`)
                    .then(resp => {
                        console.log('[PREPARACAO] Rota 2 response received:', resp.status, resp.statusText);
                        return resp.json();
                    })
            ])
                .then(([data1, data2]: any) => {
                    console.log('[PREPARACAO] Rota options loaded successfully:', { data1, data2 });
                    console.log('[PREPARACAO] Data1 structure:', JSON.stringify(data1));
                    console.log('[PREPARACAO] Data2 structure:', JSON.stringify(data2));
                    if (data1?.success && data1.options && Array.isArray(data1.options)) {
                        console.log('[PREPARACAO] Setting rota1 options:', data1.options.length, 'items');
                        setRotaEntregaOptions(data1.options);
                    } else {
                        console.warn('[PREPARACAO] Rota1 data invalid or missing options:', { success: data1?.success, hasOptions: !!data1?.options, isArray: Array.isArray(data1?.options) });
                    }
                    if (data2?.success && data2.options && Array.isArray(data2.options)) {
                        console.log('[PREPARACAO] Setting rota2 options:', data2.options.length, 'items');
                        setRotaEntrega2Options(data2.options);
                    } else {
                        console.warn('[PREPARACAO] Rota2 data invalid or missing options:', { success: data2?.success, hasOptions: !!data2?.options, isArray: Array.isArray(data2?.options) });
                    }
                    setLoadingRotas(false);
                })
                .catch((err: any) => {
                    console.error('[PREPARACAO] Error loading rota options:', err);
                    setLoadingRotas(false);
                });
        }
    }, [currentStep, checkoutSubStep, fetchDealAttachments, actions]);

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
                hubspot.fetch(`${BASE_API_URL}/hubspot/prices/deal`, {
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
            const response = await hubspot.fetch(`${BASE_API_URL}/hubspot/quote-status/${context.crm.objectId}`, { method: "GET" });
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    setQuoteStatus(result.status);

                    // Refresh HubSpot UI if backend detected external changes (Auto-Discovery)
                    if (result.status?.didUpdateHubSpot) {
                        console.log("[AUTO-DISCOVERY] Backend sync detected. Refreshing UI properties.");
                        onRefreshProperties();
                    }

                    if (result.status?.nuUnicoPedido && String(result.status.nuUnicoPedido) !== '--') {
                        setPedidoNuUnico(String(result.status.nuUnicoPedido));
                    } else {
                        setPedidoNuUnico(null);
                    }

                    // Auto-avançar para a aba Fechamento se houver um orçamento/pedido confirmado
                    if (result.status?.isConfirmed && !hasAutoAdvancedRef.current) {
                        hasAutoAdvancedRef.current = true;
                        setCurrentStep(2);

                        const isBudgetDeal = result.status.dealtype === '999';
                        const nuPedido = result.status.nuPedido;

                        if (isBudgetDeal) {
                            // Orçamento confirmado (Ainda não evoluiu) -> Ir para confirmação (Sub-etapa 0/1)
                            setCheckoutSubStep(0);
                        } else if (nuPedido) {
                            // Pedido evoluído (1010) -> Iniciar na Sub-etapa de Preparação (2)
                            setCheckoutSubStep(2);
                        } else {
                            // Outros casos (Aguardando evolução)
                            setCheckoutSubStep(0);
                        }
                    }
                }
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
            const response = await hubspot.fetch(`${BASE_API_URL}/hubspot/update/deal`, {
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
            await hubspot.fetch(`${BASE_API_URL}/hubspot/update/line-item`, {
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
            scheduleAutoSync(); // Auto-sync com ERP após mudança de quantidade
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
            await hubspot.fetch(`${BASE_API_URL}/hubspot/update/line-item`, {
                method: "POST",
                body: { lineItemId: itemId, price: unitPrice }
            });
            setSaveSuccess(true);
            onRefreshProperties(); // Sync HubSpot UI
            scheduleAutoSync(); // Auto-sync com ERP após mudança de preço
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
            hubspot.fetch(`${BASE_API_URL}/hubspot/update/line-item`, {
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
            const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/duplicate-line-item`, {
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
            const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/products/search`, {
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
            const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/line-item/add`, {
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
                // Switch to Cart tab to show the newly added item
                setItemsTab("list");
            } else setError(res.error);
        } catch (e: any) { setError(e.message); }
        finally { setAddingItem(false); }
    };

    const handleDeleteItem = async (lineItemId: string) => {
        try {
            const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/line-item/${lineItemId}`, {
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
            const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/line-item/update`, {
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
            const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/convert-to-order`, {
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
            const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/generate-header`, {
                method: "POST", body: { dealId: context.crm.objectId }
            });
            const res = await resp.json();
            if (res.success) {
                // Ao criar a capa do orçamento, forçar uma sincronização para popular os itens
                if (res.nunota) {
                    await hubspot.fetch(`${BASE_API_URL}/hubspot/sync-quote-items`, {
                        method: "POST", body: { dealId: context.crm.objectId, nunota: res.nunota }
                    }).catch(console.error);
                }
                fetchPrices();
                fetchQuoteStatus();
                onRefreshProperties();
            }
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
                        label: `[${p.codProd}] ${p.name} [Matriz: ${p.stockMatriz || 0}] [Filial: ${p.stockFilial || 0}]${p.controle ? ` (Controle: ${p.controle})` : ""}`,
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
        const isConfirmed = quoteStatus?.isConfirmed;
        const qtdItens = data?.items?.length || 0;
        const totalValue = amount || 0;
        const profitability = quoteStatus?.profitability;
        const lucro = profitability?.lucro || 0;
        const percentLucro = profitability?.percentLucro || 0;
        const isRentavel = profitability?.isRentavel;

        return (
            <Flex direction="column" gap="md">
                {/* Status Banner */}
                <Tile>
                    <Flex direction="column" gap="md">
                        <Flex justify="between" align="center">
                            <Text format={{ fontWeight: "bold" }}>🔗 Conexão com Sankhya ERP</Text>
                            <Flex gap="sm">
                                {isConfirmed && <Tag variant="success">✅ Confirmado</Tag>}
                                {!isConfirmed && hasBudget && <Tag variant="warning">⏳ Em Negociação</Tag>}
                                {!hasBudget && <Tag variant="error">⚠️ Sem Orçamento</Tag>}
                            </Flex>
                        </Flex>

                        <Divider />

                        {/* Info Grid */}
                        {hasBudget && (
                            <Flex gap="md" wrap="wrap">
                                <Flex direction="column" gap="extra-small">
                                    <Text variant="microcopy">Nro. Nota</Text>
                                    <Text format={{ fontWeight: "bold" }}>#{quoteStatus?.nrNota || quoteStatus?.nunota}</Text>
                                </Flex>
                                <Flex direction="column" gap="extra-small">
                                    <Text variant="microcopy">Itens no Orçamento</Text>
                                    <Text format={{ fontWeight: "bold" }}>{qtdItens} produto{qtdItens !== 1 ? 's' : ''}</Text>
                                </Flex>
                                <Flex direction="column" gap="extra-small">
                                    <Text variant="microcopy">Total do Orçamento</Text>
                                    <Text format={{ fontWeight: "bold" }}>{formatCurrency(totalValue)}</Text>
                                </Flex>
                                {profitability && (
                                    <Flex direction="column" gap="extra-small">
                                        <Text variant="microcopy">Rentabilidade</Text>
                                        <Tag variant={isRentavel ? "success" : "error"}>
                                            {isRentavel ? "✅" : "❌"} {percentLucro.toFixed(2)}% de lucro
                                        </Tag>
                                    </Flex>
                                )}
                            </Flex>
                        )}

                        {/* Estado de conexão */}
                        {!data?.codParceiro ? (
                            <Alert title="Parceiro Ausente" variant="warning">
                                Este negócio não tem um "Parceiro" / Empresa vinculado. Adicione uma empresa associada ou preencha a propriedade "parceiro" com o código do parceiro Sankhya.
                            </Alert>
                        ) : !hasBudget ? (
                            <Alert title="Orçamento não iniciado" variant="error">
                                Este negócio ainda não possui um orçamento no Sankhya. Clique em "Iniciar Orçamento" para criar.
                            </Alert>
                        ) : isConfirmed ? (
                            <Alert title="Orçamento Confirmado e Faturado" variant="success">
                                Este orçamento já foi confirmado no Sankhya. Nro. Nota: <Text inline={true} format={{ fontWeight: "bold" }}>#{quoteStatus?.nrNota || quoteStatus?.nunota}</Text>. Acesse o passo de Fechamento para ver os detalhes completos.
                            </Alert>
                        ) : (!data?.items || data.items.length === 0) ? (
                            <Alert title="Orçamento Vazio" variant="info">
                                Orçamento criado mas sem itens. Avance para "Gestão de Itens" para adicionar produtos.
                            </Alert>
                        ) : (
                            <Alert title="Conexão Ativa" variant="success">
                                Orçamento sincronizado com Sankhya. {qtdItens} item(s) · Total: {formatCurrency(totalValue)}
                            </Alert>
                        )}

                        {!hasBudget && (
                            <Button onClick={handleGenerateHeader} variant="primary">
                                🚀 Iniciar Orçamento (ERP)
                            </Button>
                        )}
                    </Flex>
                </Tile>

                {hasBudget && !!data?.codParceiro && (
                    <Button
                        onClick={() => navigateToStep(isConfirmed ? 2 : 1)}
                        variant="primary"
                    >
                        {isConfirmed ? '📋 Ver Resumo de Fechamento →' : 'Avançar para Produtos →'}
                    </Button>
                )}
            </Flex>
        );
    };

    const handleSyncToERP = async (silent: boolean = false) => {
        if (!quoteStatus?.nunota) return;

        setSyncing(true);
        if (!silent) setSyncResult(null);

        try {
            const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/sync-quote-items`, {
                method: "POST",
                body: { dealId: context.crm.objectId, nunota: quoteStatus.nunota }
            });

            const res = await resp.json();

            if (res.success) {
                if (!silent) {
                    setSyncResult({ success: true, message: "✅ Sincronizado com sucesso!" });
                    setTimeout(() => setSyncResult(null), 5000);
                }

                // Se o backend já devolveu o status (mais eficiente), atualiza o estado local
                if (res.quoteStatus) {
                    setQuoteStatus(res.quoteStatus);
                } else {
                    fetchQuoteStatus();
                }

                fetchPrices();
            } else {
                const errorMessage = res.message || res.error || "Erro na sincronização.";
                const details = res.errors?.length ? `\n${res.errors.join("\n")}` : "";
                const finalMessage = errorMessage + details;

                if (!silent) {
                    setSyncResult({ success: false, message: finalMessage });
                } else {
                    actions.addAlert({ type: "danger", title: "Falha na Sincronização", message: finalMessage });
                }
            }
        } catch (e: any) {
            // hubspot.fetch pode lançar exceção em status não-2xx.
            // Tentamos extrair a mensagem do body mesmo assim.
            const fallbackMsg = e.message || "Erro de comunicação com o servidor.";
            if (!silent) {
                setSyncResult({ success: false, message: `❌ ${fallbackMsg}` });
            } else {
                actions.addAlert({ type: "danger", title: "Erro de Sincronização", message: fallbackMsg });
            }
        } finally {
            setSyncing(false);
        }
    };

    // --- STEP 2: GESTÃO DE PRODUTOS (Items Hub) ---
    const handleRowClickSync = async (e: React.MouseEvent) => {
        // Ignora se o clique for em botões, inputs, select (prevenir cliques na própria linha acionando inputs)
        if ((e.target as HTMLElement).closest('button, input, select')) return;

        if (!quoteStatus?.nunota || syncing) return;

        // Background silent sync — but still surface errors
        hubspot.fetch(`${BASE_API_URL}/hubspot/sync-quote-items`, {
            method: "POST",
            body: { dealId: context.crm.objectId, nunota: quoteStatus.nunota }
        }).then((resp) => resp.json()).then((res) => {
            if (res.success) {
                fetchPrices();
                fetchQuoteStatus();
            } else {
                const details = res.errors?.length ? ` ${res.errors.join(" | ")}` : "";
                actions.addAlert({ type: "danger", title: "Falha na Sincronização", message: (res.message || "Erro") + details });
            }
        }).catch(err => {
            actions.addAlert({ type: "danger", title: "Erro de Sincronização", message: err.message });
        });
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
                                        <Button size="sm" onClick={() => handleSyncToERP()} disabled={syncing} variant="secondary">
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

                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableHeader width={50}>Ações</TableHeader>
                                        <TableHeader width={100}>Qtd</TableHeader>
                                        <TableHeader width="auto">Produto</TableHeader>
                                        <TableHeader width="auto">Lote</TableHeader>
                                        <TableHeader width="auto">Preço</TableHeader>
                                        <TableHeader width="auto">Rentab.</TableHeader>
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
                                                <Dropdown buttonText="⚙" variant="secondary" buttonSize="xs">
                                                    <Dropdown.ButtonItem onClick={() => handleViewRentabilidade(item)}>📊 Ver Rentabilidade</Dropdown.ButtonItem>
                                                    <Dropdown.ButtonItem onClick={() => handleDuplicateItem(item.id)}>📑 Duplicar</Dropdown.ButtonItem>
                                                    <Dropdown.ButtonItem onClick={() => handleDeleteItem(item.id)}>🗑️ Excluir</Dropdown.ButtonItem>
                                                </Dropdown>
                                            </TableCell>
                                            <TableCell width={200}>
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
                                                                label: c.label,
                                                                value: c.value
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
                                                            ...(getSelectedPV(item) === 'custom' ? [{ label: `Edit: ${formatCurrency((selectedPrices[item.id] || ((item.currentPrice || 0) * item.quantity)) / (item.quantity > 0 ? item.quantity : 1))}`, value: "custom" }] : []),
                                                            { label: "✏️ Definir Valor...", value: "edit_custom" }
                                                        ]}
                                                        onChange={(val) => {
                                                            if (val === "pv1") handleApplyItemPrice(item.id, item.prices.pv1 || 0);
                                                            else if (val === "pv2") handleApplyItemPrice(item.id, item.prices.pv2 || 0);
                                                            else if (val === "pv3") handleApplyItemPrice(item.id, item.prices.pv3 || 0);
                                                            else if (val === "edit_custom") {
                                                                setCustomPriceItemId(item.id);
                                                                const itemTotal = selectedPrices[item.id] !== undefined ? selectedPrices[item.id] : (item.currentPrice ? item.currentPrice * item.quantity : 0);
                                                                setCustomPriceValue(item.quantity > 0 ? itemTotal / item.quantity : itemTotal);
                                                            }
                                                        }}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {(() => {
                                                    const rentab = optimisticProfitabilities[item.id] !== undefined ? optimisticProfitabilities[item.id] : item.sankhyaProfitability;
                                                    if (rentab === undefined) {
                                                        return <Tag variant="default">⚠️ Pendente</Tag>;
                                                    }
                                                    return (
                                                        <Tag variant={rentab >= 0 ? "success" : "error"}>
                                                            {rentab >= 0 ? "✅" : "⚠️"} {rentab.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                                        </Tag>
                                                    );
                                                })()}
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
                    <Alert title="Atenção: Liberação Necessária" variant="warning">
                        Este orçamento apresenta lucro abaixo do mínimo permitido ({formatCurrency(quoteStatus.profitability.lucro)} / mínimo: {formatPercent(quoteStatus.profitability.percentLucro)}).
                        Será necessário solicitar liberação de um responsável antes de confirmar. Você pode avançar para o passo de fechamento e seguir as instruções.
                    </Alert>
                )}
                <Flex gap="sm" justify="between">
                    <Button onClick={() => navigateToStep(0)} variant="secondary">&larr; Voltar para Conexão</Button>
                    <Button
                        onClick={() => {
                            const needsRelease = quoteStatus?.profitability && !quoteStatus.profitability.isRentavel;
                            // Sempre ir para o passo 1 (evolução/confirmação) para avaliar o estado atual
                            setCheckoutSubStep(needsRelease ? 0 : 1);
                            setCheckoutError(null);
                            setCheckoutMessage(null);
                            navigateToStep(2);
                        }}
                        variant="primary"
                    >
                        Ir para Fechamento &rarr;
                    </Button>
                </Flex>
            </Flex>
        );
    };

    // Cleanup release polling on unmount
    useEffect(() => {
        return () => {
            if (releaseIntervalRef.current) clearInterval(releaseIntervalRef.current);
        };
    }, []);

    // --- STEP 3: FECHAMENTO (Checkout) --- Fase 35: Sub-etapas guiadas
    const renderStep3 = () => {
        const isConfirmed = quoteStatus?.isConfirmed;
        const profitability = quoteStatus?.profitability;
        const qtdItens = data?.items?.length || 0;
        const needsRelease = profitability && !profitability.isRentavel;

        // === Helper: Fetch liberadores ===
        const fetchLiberadores = async (searchQuery = '') => {
            try {
                const qs = searchQuery ? `?q=${encodeURIComponent(searchQuery)}&limit=20` : '?limit=20';
                const resp = await hubspot.fetch(`${BASE_API_URL}/sankhya/liberadores/buscar${qs}`, { method: "GET" });
                const res = await resp.json();
                if (res.success) setReleaseUsers(res.liberadores || []);
            } catch (e: any) {
                console.warn('[LIBERADORES] Fetch failed:', e.message);
            }
        };

        // === Helper: Check release events ===
        const fetchReleaseEvents = async () => {
            if (!quoteStatus?.nunota) return;
            try {
                const resp = await hubspot.fetch(`${BASE_API_URL}/sankhya/liberacoes/pendentes/${quoteStatus.nunota}`, { method: "GET" });
                const res = await resp.json();
                if (res.success) {
                    setReleaseEvents(res.pendentes || []);
                    if (res.allApproved) {
                        setReleaseApproved(true);
                        setReleasePolling(false);
                        if (releaseIntervalRef.current) clearInterval(releaseIntervalRef.current);
                        setCheckoutMessage('Liberação aprovada! Avançando...');
                        setTimeout(() => setCheckoutSubStep(1), 1500);
                    }
                }
            } catch (e: any) {
                console.warn('[RELEASE STATUS] Check failed:', e.message);
            }
        };

        // === Helper: Request release ===
        const handleRequestRelease = async () => {
            if (!selectedReleaseUser || !quoteStatus?.nunota || releaseEvents.length === 0) return;
            setReleaseLoading(true);
            setCheckoutError(null);
            try {
                const evento = releaseEvents[0];
                const resp = await hubspot.fetch(`${BASE_API_URL}/sankhya/liberacoes/definir`, {
                    method: "POST",
                    body: {
                        nunota: quoteStatus.nunota,
                        codusuLiber: selectedReleaseUser,
                        codevento: evento.codevento
                    }
                });
                const res = await resp.json();
                if (res.success) {
                    setCheckoutMessage('Liberação solicitada! Aguardando aprovação...');
                    setReleasePolling(true);
                    // Start polling every 30s
                    releaseIntervalRef.current = setInterval(fetchReleaseEvents, 30000);
                } else {
                    throw new Error(res.error);
                }
            } catch (e: any) {
                setCheckoutError(e.message);
            } finally {
                setReleaseLoading(false);
            }
        };

        // === Helper: Fetch Billable Items ===
        const fetchBillableItems = async () => {
            if (!quoteStatus?.nunota) return;
            setFetchingBillables(true);
            try {
                console.log(`[BILLABLES] Fetching for NUNOTA ${quoteStatus.nunota}...`);
                const resp = await hubspot.fetch(`${BASE_API_URL}/sankhya/itens-faturaveis/${quoteStatus.nunota}`, { method: "GET" });
                const res = await resp.json();
                console.log(`[BILLABLES] Response:`, res);
                if (res.success) {
                    const items = res.items || [];
                    console.log(`[BILLABLES] Found ${items.length} items`);
                    setBillableItems(items);
                    // Auto-select all pending quantities by default
                    const selection: Record<number, number> = {};
                    items.forEach((it: any) => {
                        selection[it.sequencia] = it.qtdPendente;
                    });
                    setSelectedBillItems(selection);
                }
            } catch (e: any) {
                console.error('[BILLABLES] Fetch failed:', e.message);
            } finally {
                setFetchingBillables(false);
            }
        };

        // === Helper: Confirm Quote (sub-step 1) ===
        const handleConfirmQuote = async () => {
            setCheckoutLoading(true);
            setCheckoutError(null);
            try {
                const body: any = { dealId: context.crm.objectId, nunota: quoteStatus?.nunota };
                if (needsRelease) body.forceConfirm = true;
                const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/confirm-quote`, { method: "POST", body });
                const res = await resp.json();
                if (res.success && res.confirmed) {
                    setPedidoNuUnico(res.nuUnicoPedido || null);
                    setCheckoutMessage(isBudget ? "Orçamento confirmado! Agora proceda com a evolução para pedido." : "Pedido confirmado com sucesso!");
                    fetchQuoteStatus();
                    onRefreshProperties();
                    // Se era orçamento, NÃO avançar para o passo 2. Ficar no passo 1 para o faturamento.
                    if (!isBudget) {
                        setTimeout(() => setCheckoutSubStep(2), 1500);
                    }
                } else if (res.success && res.needsRelease) {
                    // Server says needs release
                    setCheckoutSubStep(0);
                    await fetchReleaseEvents();
                    await fetchLiberadores();
                } else {
                    throw new Error(res.error || 'Falha na confirmação');
                }
            } catch (e: any) {
                setCheckoutError(e.message);
            } finally {
                setCheckoutLoading(false);
            }
        };

        // === Helper: Save obs + attach file (sub-step 2) ===
        const handlePrepareOrder = async () => {
            if (!obsInterna.trim()) {
                setCheckoutError('Observação interna é obrigatória.');
                return;
            }
            if (!selectedAttachmentId) {
                setCheckoutError('Selecione um anexo do Deal para continuar.');
                return;
            }

            // Validate if Rota de Entrega 1 is filled
            if (!rotaEntrega.trim()) {
                setCheckoutError('Rota de Entrega 1 é obrigatória. Por favor, preencha este campo antes de continuar.');
                return;
            }
            const nunotaToUse = pedidoNuUnico || quoteStatus?.nunota;
            if (!nunotaToUse) throw new Error('NUNOTA não identificado para preparação.');

            const selectedNote = dealAttachments.find((a: any) => a.id === selectedAttachmentId);
            if (!selectedNote || selectedNote.fileIds.length === 0) {
                setCheckoutError('Arquivo não encontrado no Deal.');
                return;
            }

            const fileId = selectedNote.fileIds[0];

            console.log(`[handlePrepareOrder] Preparando NUNOTA ${nunotaToUse} com arquivo ${fileId}...`);

            setCheckoutLoading(true);
            setCheckoutError(null);
            try {
                // Update HubSpot properties before saving to Sankhya
                try {
                    await actions.refreshObjectProperties();
                } catch (err) {
                    console.warn('Could not refresh properties:', err);
                }

                // Call backend endpoint that handles everything:
                // - Download file from HubSpot (solves 401 error)
                // - Attach to Sankhya
                // - Save obs to OBS_INTERNA field
                const resp = await hubspot.fetch(`${BASE_API_URL}/sankhya/pedido/preparar`, {
                    method: "POST",
                    body: {
                        dealId: context.crm.objectId,
                        nunota: nunotaToUse,
                        fileId,
                        obsInterna,
                        rotaEntrega,
                        rotaEntrega2
                    }
                });
                const res = await resp.json();
                if (!res.success) throw new Error(res.error || 'Falha na preparação do pedido');

                setCheckoutMessage('Observação salva e arquivo anexado com sucesso!');
                // Refresh HubSpot properties to sync observacao_interna and rota_de_entrega_1
                onRefreshProperties();
                setTimeout(() => setCheckoutSubStep(3), 1500);
            } catch (e: any) {
                setCheckoutError(e.message);
            } finally {
                setCheckoutLoading(false);
            }
        };

        // === Helper: Confirm Order (sub-step 3) ===
        const handleConfirmOrder = async () => {
            const nunotaPedido = pedidoNuUnico || (isBudget ? null : quoteStatus?.nunota);

            if (!nunotaPedido) {
                setCheckoutError("Número único do pedido não identificado. Certifique-se de que o faturamento (evolução) foi concluído.");
                return;
            }

            // Se já estiver confirmado nos dados locais, não precisa chamar API
            if (quoteStatus?.isConfirmed && !isBudget) {
                console.log(`[handleConfirmOrder] Nota ${nunotaPedido} já consta como confirmada. Avançando...`);
                setCheckoutMessage('Este pedido já está confirmado! Seguindo para próxima etapa...');
                setTimeout(() => fetchQuoteStatus(), 1500);
                return;
            }

            console.log(`[handleConfirmOrder] Confirmando NUNOTA ${nunotaPedido}...`);

            setCheckoutLoading(true);
            setCheckoutError(null);
            try {
                const body = { dealId: context.crm.objectId, nunota: nunotaPedido };
                const resp = await hubspot.fetch(`${BASE_API_URL}/hubspot/confirm-quote`, { method: "POST", body });
                const res = await resp.json();
                if (res.success) {
                    setCheckoutMessage(isBudget ? "Orçamento confirmado com sucesso!" : "Pedido confirmado com sucesso!");
                    // Full page reload to sync all HubSpot properties and attachments across all cards
                    setTimeout(() => actions.reloadPage(), 1500);
                } else {
                    throw new Error(res.error || 'Falha na confirmação');
                }
            } catch (err: any) {
                setCheckoutError(err.message);
            } finally {
                setCheckoutLoading(false);
            }
        };

        // === Helper: Bill/Evolve Order (Alternative Flow) ===
        const handleBillOrder = async () => {
            if (!quoteStatus?.nunota) return;
            setCheckoutLoading(true);
            setCheckoutError(null);
            try {
                const items = Object.entries(selectedBillItems)
                    .filter(([_, qty]) => qty > 0)
                    .map(([seq, qty]) => ({ sequencia: Number(seq), quantidade: qty }));

                if (isPartialBill && items.length === 0) throw new Error("Selecione ao menos um item com quantidade positiva para faturar.");

                const targetTOP = !pedidoNuUnico ? 1010 : 1100;

                const resp = await hubspot.fetch(`${BASE_API_URL}/sankhya/pedido/faturar`, {
                    method: "POST",
                    body: {
                        dealId: context.crm.objectId,
                        nunota: quoteStatus.nunota,
                        targetTOP,
                        items: isPartialBill ? items : undefined
                    }
                });
                const res = await resp.json();
                if (res.success) {
                    setCheckoutMessage(res.message);
                    if (targetTOP === 1010) {
                        // Evolving to TOP 1010: reload page to sync new order number and properties
                        setPedidoNuUnico(res.nuFaturamento);
                        setTimeout(() => actions.reloadPage(), 1500);
                    } else {
                        // Generating NFe (TOP 1100): full page reload to show invoice details
                        setTimeout(() => actions.reloadPage(), 1500);
                    }
                } else {
                    throw new Error(res.error || 'Falha no faturar');
                }
            } catch (e: any) {
                setCheckoutError(e.message);
            } finally {
                setCheckoutLoading(false);
            }
        };

        // === Sub-step logic for indicator ===
        const isBudget = quoteStatus?.dealtype === '999';
        const isOrder = quoteStatus?.dealtype === '1010';
        const isNFe = quoteStatus?.dealtype === '1100';

        const subStepNames = [
            'Evolução (1010)',
            'Preparação',
            'Confirmação',
            'Faturamento (1100)'
        ];

        // Safely determine the effective sub-step based on business rules.
        // Rule: We MUST stay in Step 1 (Evolução) if we don't have a valid unique order number (pedidoNuUnico).
        const effectiveSubStep = (() => {
            if (checkoutSubStep === 0 && needsRelease) return 0;

            const hasNoValidPedido = !pedidoNuUnico || pedidoNuUnico === '--' || pedidoNuUnico === '0';

            // If we're missing the order ID, we can't be in Preparation (2) or Confirmation (3)
            if (hasNoValidPedido && checkoutSubStep >= 2) {
                return 1;
            }

            // Forced step 1 for budgets without a generated order
            if (isBudget && hasNoValidPedido) return 1;

            return checkoutSubStep;
        })();

        let displaySubStep = 0;
        if (effectiveSubStep === 1) {
            displaySubStep = 0; // Evolução (1010)
        } else if (effectiveSubStep === 2) {
            displaySubStep = 1; // Preparação
        } else if (effectiveSubStep === 3) {
            displaySubStep = 2; // Confirmação
        } else if (isOrder && quoteStatus?.isConfirmed && !isBudget) {
            displaySubStep = 3; // Faturamento (1100)
        } else if (isNFe) {
            displaySubStep = 3; // Mantém no último step (Faturamento)
        }

        return (
            <Flex direction="column" gap="md">
                <Tile>
                    <Flex direction="column" gap="md">

                        {/* === ESTADO: FINALIZADO (NFe Gerada) === */}
                        {isNFe ? (
                            <Flex direction="column" gap="md">
                                <Flex justify="between" align="center">
                                    <Heading>📋 Resumo do Faturamento</Heading>
                                    <Tag variant="success">✅ NF-e Gerada</Tag>
                                </Flex>
                                <Divider />

                                <Flex gap="md" wrap="wrap">
                                    <Flex direction="column" gap="extra-small">
                                        <Text variant="microcopy">Nro. NF-e Sankhya</Text>
                                        <Text format={{ fontWeight: "bold" }}>#{quoteStatus?.nrNota || quoteStatus?.nunota}</Text>
                                    </Flex>
                                    <Flex direction="column" gap="extra-small">
                                        <Text variant="microcopy">Status</Text>
                                        <Text format={{ fontWeight: "bold" }}>{quoteStatus?.statusNota === 'L' ? 'Confirmada' : 'Aguardando'}</Text>
                                    </Flex>
                                    <Flex direction="column" gap="extra-small">
                                        <Text variant="microcopy">Valor Total</Text>
                                        <Text format={{ fontWeight: "bold" }}>{formatCurrency(amount || 0)}</Text>
                                    </Flex>
                                </Flex>

                                <Divider />

                                <Alert title="Processo Concluído" variant="success">
                                    A Nota Fiscal de Venda foi gerada com sucesso. O fluxo de faturamento da Tradipar foi finalizado para este negócio.
                                </Alert>
                            </Flex>

                        ) : (
                            /* === ESTADO: FLUXO DE SUB-ETAPAS === */
                            <Flex direction="column" gap="md">
                                <Flex justify="between" align="center">
                                    <Heading>📋 Fechamento</Heading>
                                    <Text variant="microcopy">Nro. Nota: #{quoteStatus?.nrNota || quoteStatus?.nunota || '—'}</Text>
                                </Flex>

                                <StepIndicator
                                    currentStep={Math.min(subStepNames.length - 1, Math.max(0, displaySubStep))}
                                    stepNames={subStepNames}
                                />

                                <Divider />

                                {/* Totais resumidos */}
                                <Flex direction="row" gap="xl" justify="center" align="center">
                                    <Flex direction="column" align="center">
                                        <Text variant="microcopy">Total</Text>
                                        <Text format={{ fontWeight: "bold" }}>{formatCurrency(amount || 0)}</Text>
                                    </Flex>
                                    <Flex direction="column" align="center">
                                        <Text variant="microcopy">Itens</Text>
                                        <Text format={{ fontWeight: "bold" }}>{qtdItens}</Text>
                                    </Flex>
                                    {profitability && (
                                        <Flex direction="column" align="center">
                                            <Text variant="microcopy">Lucro</Text>
                                            <Tag variant={profitability.isRentavel ? "success" : "error"}>
                                                {profitability.isRentavel ? "✅" : "⚠️"} {formatCurrency(profitability.lucro)}
                                            </Tag>
                                        </Flex>
                                    )}
                                </Flex>

                                <Divider />

                                {/* Feedback messages */}
                                {checkoutError && <Alert title="Erro" variant="danger">{checkoutError}</Alert>}
                                {checkoutMessage && <Alert title="Info" variant="success">{checkoutMessage}</Alert>}

                                {/* ========== SUB-STEP 0: LIBERAÇÃO ========== */}
                                {effectiveSubStep === 0 && needsRelease && (
                                    <Flex direction="column" gap="md">
                                        <Alert title="Liberação Necessária" variant="warning">
                                            Lucro atual: {formatCurrency(profitability!.lucro)} — Mínimo exigido: {formatPercent(profitability!.percentLucro)}. É necessário solicitar liberação.
                                        </Alert>

                                        {releaseEvents.length === 0 && (
                                            <Button variant="secondary" onClick={fetchReleaseEvents} disabled={releaseLoading}>
                                                {releaseLoading ? 'Carregando...' : '🔍 Verificar Pendências'}
                                            </Button>
                                        )}

                                        {releaseEvents.length > 0 && !releasePolling && !releaseApproved && (
                                            <Flex direction="column" gap="sm">
                                                <Text format={{ fontWeight: "bold" }}>Eventos pendentes:</Text>
                                                {releaseEvents.map((ev, idx) => (
                                                    <Flex key={idx} gap="sm" align="center">
                                                        <Tag variant="warning">{ev.descricao || `Evento ${ev.codevento}`}</Tag>
                                                        <Text variant="microcopy">Min: {ev.vlrMinimo} | Atual: {ev.vlrAtual}</Text>
                                                    </Flex>
                                                ))}

                                                <Divider />

                                                <Text format={{ fontWeight: "bold" }}>Selecione o liberador:</Text>
                                                {releaseUsers.length === 0 && (
                                                    <Button variant="secondary" size="sm" onClick={() => fetchLiberadores()}>
                                                        Carregar Liberadores
                                                    </Button>
                                                )}
                                                {releaseUsers.length > 0 && (
                                                    <Select
                                                        name="liberador-select"
                                                        options={releaseUsers.map(u => ({
                                                            label: u.nome,
                                                            value: String(u.codusu)
                                                        }))}
                                                        value={selectedReleaseUser ? String(selectedReleaseUser) : ''}
                                                        onChange={(val) => setSelectedReleaseUser(Number(val))}
                                                        placeholder="Selecione um responsável..."
                                                    />
                                                )}

                                                <Button
                                                    variant="primary"
                                                    onClick={handleRequestRelease}
                                                    disabled={!selectedReleaseUser || releaseLoading}
                                                >
                                                    {releaseLoading ? 'Solicitando...' : '🔒 Solicitar Liberação'}
                                                </Button>
                                            </Flex>
                                        )}

                                        {releasePolling && !releaseApproved && (
                                            <Alert title="Aguardando Aprovação" variant="info">
                                                ⏳ Verificando automaticamente a cada 30 segundos. Aguarde a aprovação do liberador no Sankhya...
                                            </Alert>
                                        )}

                                        {releaseApproved && (
                                            <Alert title="Liberação Aprovada!" variant="success">
                                                ✅ A liberação foi concedida. Avançando para confirmação do orçamento...
                                            </Alert>
                                        )}
                                    </Flex>
                                )}

                                {/* ========== SUB-STEP 1: CONFIRMAR OU EVOLUIR ========== */}
                                {effectiveSubStep === 1 && (
                                    <Flex direction="column" gap="md">
                                        <Flex direction="column" gap="extra-small" align="center">
                                            <Heading>🚀 {(isBudget || !pedidoNuUnico || pedidoNuUnico === '--') ? "Gerar Pedido de Venda (1010)" : "Emitir Nota Fiscal (1100)"}</Heading>
                                            <Text variant="microcopy">
                                                {(isBudget || !pedidoNuUnico || pedidoNuUnico === '--')
                                                    ? `O Orçamento #${quoteStatus?.nunota} está confirmado e pronto para virar um pedido oficial.`
                                                    : `O Pedido #${quoteStatus?.nunota} está pronto para ser faturado e gerar a NF-e.`}
                                            </Text>
                                        </Flex>

                                        {!quoteStatus?.isConfirmed ? (
                                            <Alert title="Confirmação Necessária" variant="warning">
                                                Este {isBudget ? 'orçamento' : 'pedido'} ainda não foi confirmado no Sankhya. Clique no botão abaixo para confirmá-lo e prosseguir com o faturamento.
                                                <Button variant="primary" onClick={handleConfirmQuote} disabled={checkoutLoading}>
                                                    {checkoutLoading ? 'Confirmando...' : `✅ Confirmar ${isBudget ? 'Orçamento (999)' : 'Pedido (1010)'}`}
                                                </Button>
                                            </Alert>
                                        ) : (
                                            <Flex direction="column" gap="md">
                                                <Alert title="Pronto para Faturar" variant="success">
                                                    {isBudget ? 'Orçamento' : 'Pedido'} #( {quoteStatus?.nunota} ) confirmado! Agora você pode gerar o {isBudget ? 'pedido (1010)' : 'NF-e (1100)'}.
                                                </Alert>

                                                <Flex justify="between" align="center">
                                                    <Text format={{ fontWeight: "bold" }}>Deseja selecionar itens para faturamento parcial?</Text>
                                                    <Button
                                                        variant={isPartialBill ? "secondary" : "primary"}
                                                        onClick={() => {
                                                            const newValue = !isPartialBill;
                                                            setIsPartialBill(newValue);
                                                            if (newValue && billableItems.length === 0) fetchBillableItems();
                                                        }}
                                                    >
                                                        {isPartialBill ? "🔄 Faturar Tudo" : "📋 Selecionar Itens"}
                                                    </Button>
                                                </Flex>

                                                {isPartialBill && (
                                                    <Box>
                                                        {fetchingBillables ? (
                                                            <LoadingSpinner label="Buscando itens do Sankhya..." />
                                                        ) : (
                                                            <Box>
                                                                <Table>
                                                                    <TableHead>
                                                                        <TableRow>
                                                                            <TableHeader>Item</TableHeader>
                                                                            <TableHeader>Pendente</TableHeader>
                                                                            <TableHeader>Faturar</TableHeader>
                                                                            <TableHeader>Ação</TableHeader>
                                                                        </TableRow>
                                                                    </TableHead>
                                                                    <TableBody>
                                                                        {billableItems.map(it => {
                                                                            const isRemoved = (selectedBillItems[it.sequencia] || 0) <= 0;
                                                                            return (
                                                                                <TableRow key={it.sequencia}>
                                                                                    <TableCell>
                                                                                        <Flex direction="column">
                                                                                            <Text format={isRemoved ? { italic: true } : { fontWeight: "bold" }}>{it.descrProd}</Text>
                                                                                            <Text variant="microcopy">Cód: {it.codProd} | Unit: {formatCurrency(it.vlrUnit)}</Text>
                                                                                        </Flex>
                                                                                    </TableCell>
                                                                                    <TableCell>{it.qtdPendente}</TableCell>
                                                                                    <TableCell>
                                                                                        <NumberInput
                                                                                            label=""
                                                                                            name={`qty-${it.sequencia}`}
                                                                                            value={selectedBillItems[it.sequencia] || 0}
                                                                                            onChange={(val) => setSelectedBillItems(prev => ({ ...prev, [it.sequencia]: val || 0 }))}
                                                                                            readOnly={isRemoved}
                                                                                        />
                                                                                    </TableCell>
                                                                                    <TableCell>
                                                                                        <Button
                                                                                            variant={isRemoved ? "secondary" : "destructive"}
                                                                                            size="xs"
                                                                                            onClick={() => {
                                                                                                const newQty = isRemoved ? it.qtdPendente : 0;
                                                                                                setSelectedBillItems(prev => ({ ...prev, [it.sequencia]: newQty }));
                                                                                            }}
                                                                                        >
                                                                                            {isRemoved ? "Incluir" : "Remover"}
                                                                                        </Button>
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            );
                                                                        })}
                                                                    </TableBody>
                                                                </Table>
                                                            </Box>
                                                        )}
                                                    </Box>
                                                )}

                                                <Divider />

                                                <Button
                                                    variant="primary"
                                                    onClick={handleBillOrder}
                                                    disabled={checkoutLoading || (isPartialBill && billableItems.length === 0)}
                                                >
                                                    {checkoutLoading ? 'Processando...' : `🚀 ${(isBudget || !pedidoNuUnico || pedidoNuUnico === '--') ? 'Criar Pedido (1010)' : 'Faturar para NF-e (1100)'} ${isPartialBill ? 'Parcial' : ''}`}
                                                </Button>
                                            </Flex>
                                        )}
                                    </Flex>
                                )}

                                {/* ========== SUB-STEP 2: PREPARAR PEDIDO ========== */}
                                {effectiveSubStep === 2 && (
                                    <Flex direction="column" gap="md">
                                        <Heading>📋 Preparar Pedido TOP 1010</Heading>
                                        <Text variant="microcopy">
                                            {pedidoNuUnico
                                                ? `✅ Novo Pedido Gerado: #${pedidoNuUnico}`
                                                : `🛠️ Configurando Pedido: #${quoteStatus?.nunota}`}
                                        </Text>

                                        <Divider />

                                        <Flex direction="row" gap="md">
                                            <Box style={{ flex: 1 }}>
                                                <Input
                                                    label="Observação Interna (obrigatória)"
                                                    name="obs-interna"
                                                    value={obsInterna}
                                                    onChange={(val) => setObsInterna(val)}
                                                    placeholder="Ex.: Referente ao pedido de compra #12345..."
                                                />
                                            </Box>
                                            <Box style={{ flex: 1 }}>
                                                {loadingRotas ? (
                                                    <LoadingSpinner label="Carregando rotas..." size="sm" />
                                                ) : (
                                                    <Select
                                                        label="Rota de Entrega 1 (obrigatória)"
                                                        name="rota-entrega-1"
                                                        value={rotaEntrega}
                                                        onChange={(val) => setRotaEntrega(val as string)}
                                                        options={rotaEntregaOptions}
                                                        placeholder="Selecione uma rota..."
                                                    />
                                                )}
                                            </Box>
                                            <Box style={{ flex: 1 }}>
                                                {loadingRotas ? (
                                                    <LoadingSpinner label="Carregando rotas..." size="sm" />
                                                ) : (
                                                    <Select
                                                        label="Rota de Entrega 2 (opcional)"
                                                        name="rota-entrega-2"
                                                        value={rotaEntrega2}
                                                        onChange={(val) => setRotaEntrega2(val as string)}
                                                        options={rotaEntrega2Options}
                                                        placeholder="Selecione uma rota (opcional)..."
                                                    />
                                                )}
                                            </Box>
                                        </Flex>

                                        <Divider />

                                        <Text format={{ fontWeight: "bold" }}>📎 Selecionar Anexo (Obrigatório)</Text>

                                        {fetchingAttachments ? (
                                            <LoadingSpinner label="Carregando anexos do Deal..." size="sm" />
                                        ) : dealAttachments.length === 0 ? (
                                            <Alert title="Nenhum anexo encontrado" variant="warning">
                                                Nenhum arquivo foi anexado ao Deal ainda. Use o card de Anexos nativo do HubSpot para anexar o pedido de compra.
                                            </Alert>
                                        ) : (
                                            <Select
                                                label="Escolha o arquivo para enviar ao Sankhya"
                                                name="attachment-select"
                                                options={dealAttachments.flatMap((att: any) =>
                                                    att.fileIds.map((fileId: string, idx: number) => ({
                                                        label: `${att.body || 'Anexo'} - ${new Date(att.timestamp).toLocaleDateString('pt-BR')}`,
                                                        value: att.id
                                                    }))
                                                )}
                                                value={selectedAttachmentId || ""}
                                                onChange={(val) => setSelectedAttachmentId(val as string)}
                                                placeholder="Selecione um anexo..."
                                            />
                                        )}

                                        <Alert title="Como funciona" variant="info">
                                            Os arquivos são obtidos do card de Anexos nativo do HubSpot. Anexe o pedido de compra lá e ele aparecerá nesta lista.
                                        </Alert>
                                        <Alert title="Caso o arquivo não apareça" variant="info">
                                            Se o arquivo não aparecer após adicionar em "Anexos", recarregue a página completamente.
                                        </Alert>

                                        <Button
                                            variant="primary"
                                            onClick={handlePrepareOrder}
                                            disabled={checkoutLoading || !obsInterna.trim() || !selectedAttachmentId || fetchingAttachments}
                                        >
                                            {checkoutLoading ? 'Enviando...' : '📤 Enviar OBS, Anexar e Avançar'}
                                        </Button>
                                    </Flex>
                                )}

                                {/* ========== SUB-STEP 3: CONFIRMAR PEDIDO ========== */}
                                {effectiveSubStep === 3 && (
                                    <Flex direction="column" gap="md" align="center">
                                        <Text format={{ fontWeight: "bold" }}>✅ Confirmar Pedido no Sankhya</Text>
                                        <Text variant="microcopy">
                                            Prepare o pedido confirmando-o no Sankhya para que ele possa ser faturado posteriormente para NF-e.
                                        </Text>

                                        <Button
                                            variant="primary"
                                            onClick={handleConfirmOrder}
                                            disabled={checkoutLoading}
                                        >
                                            {checkoutLoading ? 'Confirmando...' : `✅ Finalizar e Confirmar Pedido (#${pedidoNuUnico || quoteStatus?.nunota})`}
                                        </Button>
                                    </Flex>
                                )}

                            </Flex>
                        )}
                    </Flex>
                </Tile>

                <Button onClick={() => navigateToStep(1)} variant="secondary">&larr; Voltar para Itens</Button>
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

    if (!recordReady) return <LoadingSpinner label="Lendo dados do Negócio..." showLabel />;
    if (loading) return <LoadingSpinner label="Conectando ao Sankhya Om..." showLabel />;
    if (isTransitioning) return <LoadingSpinner label="Carregando..." showLabel size="lg" />;

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