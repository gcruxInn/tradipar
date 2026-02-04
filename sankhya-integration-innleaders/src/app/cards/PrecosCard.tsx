import React, { useEffect, useState } from "react";
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
    Accordion,
    Select,
    Modal,
    ModalBody,
    Dropdown,
    Icon,
    Link,
    Input,
    SearchInput,
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
    profitability?: any;
    profitabilityError?: string;
    statusNota?: string;
}

interface PrecosResponse {
    items: ItemData[];
    currentAmount: string;
    currentStage: string;
    stageLabel?: string;
    codEmp: string | number;
}

hubspot.extend<'crm.record.tab'>(({ context, actions }) => (
    <PrecosCard
        context={context}
        onRefreshProperties={actions.refreshObjectProperties}
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

const PrecosCard = ({ context, onRefreshProperties }: PrecosCardProps) => {
    const [data, setData] = useState<PrecosResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [missingData, setMissingData] = useState<any>(null);

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

    // Batch Control State
    const [availableControls, setAvailableControls] = useState<Record<string, { controle: string, saldo: number }[]>>({});

    const fetchControlsForProduct = async (codProd: string) => {
        if (availableControls[codProd]) return;
        try {
            const resp = await hubspot.fetch(`https://api.gcrux.com/hubspot/products/controls/${codProd}?codEmp=${data?.codEmp || ""}`);
            const res = await resp.json();
            if (res.success) {
                setAvailableControls(prev => ({ ...prev, [codProd]: res.controls }));
            }
        } catch (e) { console.error("Error fetching controls", e); }
    };

    // Auto-select single batch via Effect to avoid scope issues
    useEffect(() => {
        if (!data?.items) return;
        data.items.forEach(item => {
            const controls = availableControls[item.codProd];
            if (controls && controls.length === 1 && !item.sankhyaControle) {
                const singleControl = controls[0].controle;
                handleUpdateItemControl(item.id, singleControl);
            }
        });
    }, [availableControls]);

    // Custom Price State
    const [customPriceItemId, setCustomPriceItemId] = useState<string | null>(null);
    const [customPriceValue, setCustomPriceValue] = useState<number | undefined>(undefined);
    const [customUnitPriceValue, setCustomUnitPriceValue] = useState<number | undefined>(undefined);

    // Selected prices per item
    const [selectedPrices, setSelectedPrices] = useState<Record<string, number>>({});
    const [selectedPriceTypes, setSelectedPriceTypes] = useState<Record<string, string>>({});
    const [customPriceDisplayMode, setCustomPriceDisplayMode] = useState<Record<string, 'unit' | 'total'>>({});

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

    const hasStockIssue = data?.items?.some(i => i.stock < i.quantity) || false;

    const formatCurrency = (value: number | null): string => {
        if (value === null || value === undefined) return "---";
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    };

    useEffect(() => {
        if (data?.items) {
            data.items.forEach(item => {
                if (item.codProd) fetchControlsForProduct(item.codProd);
            });
        }
    }, [data]);

    const fetchPrices = async () => {
        setLoading(true);
        setError(null);
        setMissingData(null);
        try {
            const response = await hubspot.fetch("https://api.gcrux.com/hubspot/prices/deal", {
                method: "POST",
                body: { objectId: context.crm.objectId }
            });
            if (!response.ok) throw new Error(`Erro API: ${response.status}`);
            const result = await response.json();

            if (result && result.status === "SUCCESS") {
                setData(result);
                if (result.currentAmount) setAmount(Number(result.currentAmount));
                const initialTypes: Record<string, string> = {};
                const initialPrices: Record<string, number> = {};
                result.items.forEach((item: ItemData) => {
                    if (item.currentPrice) {
                        initialPrices[item.id] = item.currentPrice * item.quantity;
                        if (Math.abs(item.currentPrice - (item.prices.pv1 || 0)) < 0.01) initialTypes[item.id] = 'pv1';
                        else if (Math.abs(item.currentPrice - (item.prices.pv2 || 0)) < 0.01) initialTypes[item.id] = 'pv2';
                        else if (Math.abs(item.currentPrice - (item.prices.pv3 || 0)) < 0.01) initialTypes[item.id] = 'pv3';
                        else initialTypes[item.id] = 'custom';
                    }
                });
                setSelectedPriceTypes(initialTypes);
                setSelectedPrices(initialPrices);
            } else if (result && result.status === "MISSING_DATA") {
                setMissingData(result.details);
            } else {
                setError(result.error || "Erro ao carregar dados.");
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
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

    useEffect(() => {
        if (context.crm.objectId) {
            fetchPrices();
            fetchQuoteStatus();
        }
    }, [context.crm.objectId]);

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
        try {
            await hubspot.fetch("https://api.gcrux.com/hubspot/update/line-item", {
                method: "POST",
                body: { lineItemId: itemId, quantity: newQty }
            });
        } catch (err) {
            console.error(err);
        }
    };

    const handleApplyItemPrice = async (itemId: string, unitPrice: number) => {
        if (!data) return;
        const item = data.items.find(i => i.id === itemId);
        if (!item) return;
        const total = unitPrice * item.quantity;
        setSelectedPrices(prev => ({ ...prev, [itemId]: total }));

        let type = 'custom';
        if (Math.abs(unitPrice - (item.prices.pv1 || 0)) < 0.01) type = 'pv1';
        else if (Math.abs(unitPrice - (item.prices.pv2 || 0)) < 0.01) type = 'pv2';
        else if (Math.abs(unitPrice - (item.prices.pv3 || 0)) < 0.01) type = 'pv3';
        setSelectedPriceTypes(prev => ({ ...prev, [itemId]: type }));

        try {
            await hubspot.fetch("https://api.gcrux.com/hubspot/update/line-item", {
                method: "POST",
                body: { lineItemId: itemId, price: unitPrice }
            });
            setSaveSuccess(true);
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
                const unitPrice = customPriceValue / item.quantity;
                setSelectedPrices(prev => ({ ...prev, [customPriceItemId]: customPriceValue }));
                setSelectedPriceTypes(prev => ({ ...prev, [customPriceItemId]: 'custom' }));
                handleApplyItemPrice(customPriceItemId, unitPrice);
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
            if (res.success) {
                onRefreshProperties();
                fetchPrices(); // Re-fetch para sincronizar tudo
            } else setError(res.error);
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
                    return {
                        ...prev,
                        items: prev.items.filter(i => i.id !== lineItemId)
                    };
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
                <SearchInput
                    label="Busca de Produto"
                    name="prod-filter"
                    placeholder="Buscar por código ou nome (mín 3 letras)..."
                    onInput={(val: string) => {
                        setSearchTerm(val);
                        handleSearchProducts(val);
                    }}
                />

                {searchTerm.length >= 3 && !searching && searchResults.length === 0 && (
                    <Alert title="Sem resultados" variant="warning">A busca por "{searchTerm}" não retornou produtos no Sankhya.</Alert>
                )}

                {searching && <LoadingSpinner label="Buscando produtos..." size="sm" />}

                <Select
                    label="Selecionar Resultado"
                    name="prod-search"
                    placeholder="Selecione o produto..."
                    options={searchResults.map((p: any) => ({
                        label: `[${p.codProd}] ${p.name}${p.controle ? ` (Controle: ${p.controle})` : ""}`,
                        value: p.codProd.toString()
                    }))}
                    onChange={(val: any) => {
                        if (val) {
                            const prod = searchResults.find((r: any) => r.codProd.toString() === val.toString());
                            setSelectedProduct(prod);
                        }
                    }}
                />

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

    if (loading) return <LoadingSpinner label="Consultando tabelas Sankhya..." />;

    if (missingData) {
        if (!missingData.codParc) return <Alert title="Parceiro não identificado" variant="warning">Adicione uma Empresa ao negócio.</Alert>;
        if (!missingData.items || missingData.items.length === 0) {
            if (missingData.nunota) {
                return (
                    <Flex direction="column" gap="md">
                        <Alert title="Orçamento em Andamento" variant="info">
                            Negócio vinculado ao orçamento **{missingData.nunota}**.
                        </Alert>
                        <Divider />
                        <Text format={{ fontWeight: "bold" }}>Adicionar Primeiro Item:</Text>
                        {renderAddItemContent()}
                        {error && <Alert title="Erro" variant="error">{error}</Alert>}
                    </Flex>
                );
            }

            return (
                <Flex direction="column" gap="md">
                    <Alert title="Vínculo com Sankhya Pendente" variant="info">
                        Inicie o orçamento no Sankhya para prosseguir e preencher a Natureza automaticamente.
                    </Alert>
                    <Button onClick={handleGenerateHeader} variant="primary">🔨 Iniciar Orçamento no Sankhya</Button>
                </Flex>
            );
        }
        return <Alert title="Dados Incompletos" variant="warning">Certifique-se que o negócio tem Parceiro e Itens.</Alert>;
    }

    if (error) return (
        <Flex direction="column" gap="sm">
            <Alert title="Erro" variant="error">{error}</Alert>
            <Button onClick={fetchPrices} variant="secondary">Tentar Novamente</Button>
        </Flex>
    );

    return (
        <Flex direction="column" gap="md">
            {/* 1. HEADER */}
            <Flex align="center" justify="between">
                <Flex align="center" gap="sm">
                    <Text format={{ fontWeight: "bold" }}>Status:</Text>
                    <Tag variant={data?.currentStage === 'decisionmakerboughtin' ? "warning" : "info"}>{data?.stageLabel || data?.currentStage}</Tag>
                    {quoteStatus?.hasQuote && (
                        <Tag variant={quoteStatus.isConfirmed ? "success" : "warning"}>Sankhya: {quoteStatus.isConfirmed ? "Confirmado" : "Pendente"}</Tag>
                    )}
                </Flex>
                <Dropdown buttonText="" variant="transparent" buttonSize="md">
                    <Dropdown.ButtonItem onClick={fetchPrices}>↻ Atualizar Card</Dropdown.ButtonItem>
                    <Dropdown.ButtonItem onClick={fetchQuoteStatus}>🔄 Atualizar Status</Dropdown.ButtonItem>
                    {quoteStatus?.hasQuote && (
                        <Dropdown.ButtonItem>
                            <Link href={`https://snkbrt01502.ativy.com/mge/nota/${quoteStatus.nunota}`}>📄 Abrir no ERP</Link>
                        </Dropdown.ButtonItem>
                    )}
                </Dropdown>
            </Flex>
            <Divider />

            {/* 2. PRICE TOTALS */}
            <Flex direction="row" gap="sm" justify="between" align="center" wrap="wrap">
                <Button variant="transparent" size="sm" onClick={() => handleApplyAllItemsPV("pv1")}><Text format={{ fontWeight: "bold" }}>PV1:</Text> {formatCurrency(totals.pv1)}</Button>
                <Button variant="transparent" size="sm" onClick={() => handleApplyAllItemsPV("pv2")}><Text format={{ fontWeight: "bold" }}>PV2:</Text> {formatCurrency(totals.pv2)}</Button>
                <Button variant="transparent" size="sm" onClick={() => handleApplyAllItemsPV("pv3")}><Text format={{ fontWeight: "bold" }}>PV3:</Text> {formatCurrency(totals.pv3)}</Button>
                <Box flex={1}>
                    <Flex direction="row" gap="xs" align="end" justify="end">
                        <NumberInput name="amount" label="Valor Total" value={amount} onChange={setAmount} onBlur={() => handleSaveAmount()} />
                        {saving && <LoadingSpinner label="Salvando..." size="sm" />}
                        {saveSuccess && <Text variant="microcopy">✓</Text>}
                    </Flex>
                </Box>
            </Flex>

            <Divider />

            {/* 3. ADD ITEM */}
            <Accordion title="➕ Adicionar Produto" defaultOpen={false}>
                {renderAddItemContent()}
            </Accordion>

            <Divider />

            {/* 4. ITEM LIST */}
            <Accordion title={`Ver Detalhes (${data?.items?.length || 0} itens)`} defaultOpen={false}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeader width="auto">#</TableHeader>
                            <TableHeader width="auto">Qtd</TableHeader>
                            <TableHeader width="auto">Produto</TableHeader>
                            <TableHeader width="auto">Lote</TableHeader>
                            <TableHeader width="auto">Preço</TableHeader>
                            <TableHeader width="auto">Rentab.</TableHeader>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data?.items.map(item => (
                            <TableRow key={item.id}>
                                <TableCell>
                                    <Dropdown buttonText="" variant="secondary" buttonSize="xs">
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
                                    />
                                </TableCell>
                                <TableCell>
                                    <Text format={{ fontWeight: "bold" }}>{item.name}</Text>
                                    <Tag variant={item.stock < item.quantity ? "error" : "success"}>Estoque SNK: {item.stock}</Tag>
                                </TableCell>
                                <TableCell>
                                    {availableControls[item.codProd] ? (
                                        availableControls[item.codProd].length > 0 ? (
                                            <Select
                                                name={`lote-${item.id}`}
                                                placeholder="Selecione..."
                                                options={availableControls[item.codProd].map(c => ({
                                                    label: `${c.controle} (${c.saldo})`,
                                                    value: c.controle
                                                }))}
                                                value={item.sankhyaControle || ""}
                                                onChange={(val) => handleUpdateItemControl(item.id, val)}
                                            />
                                        ) : <Tag variant="warning">Sem Estoque</Tag>
                                    ) : <LoadingSpinner size="sm" />}
                                </TableCell>
                                <TableCell>
                                    <Flex direction="column" gap="xs">
                                        <Select
                                            label=""
                                            name={`pv-${item.id}`}
                                            value={getSelectedPV(item)}
                                            options={[
                                                { label: `PV1: ${formatCurrency(item.prices.pv1)}`, value: "pv1" },
                                                { label: `PV2: ${formatCurrency(item.prices.pv2)}`, value: "pv2" },
                                                { label: `PV3: ${formatCurrency(item.prices.pv3)}`, value: "pv3" },
                                                ...(getSelectedPV(item) === 'custom' ? [{ label: `Personalizado`, value: "custom" }] : [])
                                            ]}
                                            onChange={(val) => {
                                                if (val === "pv1") handleApplyItemPrice(item.id, item.prices.pv1 || 0);
                                                else if (val === "pv2") handleApplyItemPrice(item.id, item.prices.pv2 || 0);
                                                else if (val === "pv3") handleApplyItemPrice(item.id, item.prices.pv3 || 0);
                                            }}
                                        />
                                        <Button
                                            variant="secondary"
                                            size="xs"
                                            onClick={() => setCustomPriceItemId(item.id)}
                                        >
                                            ✍️ Customizar
                                        </Button>
                                        <Text variant="microcopy">Total: {formatCurrency(selectedPrices[item.id] || (item.currentPrice || 0) * item.quantity)}</Text>
                                    </Flex>
                                </TableCell>
                                <TableCell>
                                    {item.sankhyaProfitability !== undefined ? (
                                        <Tag variant={item.sankhyaProfitability > 0 ? "success" : "warning"}>
                                            {item.sankhyaProfitability}%
                                        </Tag>
                                    ) : (
                                        <Tag variant="info">Aguardando</Tag>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Flex justify="end" align="center" gap="sm">
                    <Text format={{ fontWeight: "bold" }}>Total: {formatCurrency(calculateSelectedTotal())}</Text>
                    <Button variant="primary" size="xs" onClick={() => { const t = calculateSelectedTotal(); setAmount(t); handleSaveAmount(t); }}>✓ Aplicar</Button>
                </Flex>
            </Accordion>

            <Divider />

            {/* 5. RENTABILIDADE GERAL */}
            {
                quoteStatus?.hasQuote && (
                    <Accordion title="📊 Rentabilidade Geral" defaultOpen={false}>
                        {quoteStatus.profitability ? (
                            <Flex direction="column" gap="xs">
                                <Flex justify="between"><Text>Faturamento:</Text><Text format={{ fontWeight: "bold" }}>{formatCurrency(quoteStatus.profitability.faturamento)}</Text></Flex>
                                <Flex justify="between"><Text>Lucro:</Text><Tag variant={quoteStatus.isRentavel ? "success" : "error"}>{formatCurrency(quoteStatus.profitability.lucro)} ({quoteStatus.profitability.percentLucro?.toFixed(1)}%)</Tag></Flex>
                            </Flex>
                        ) : <Text variant="microcopy">Carregando...</Text>}
                    </Accordion>
                )
            }

            {hasStockIssue && <Alert title="Corte de Estoque" variant="error">Há itens com estoque insuficiente.</Alert>}

            {/* 6. ACOES */}
            <Flex direction="column" gap="sm">
                <Text format={{ fontWeight: "bold" }}>Ações do ERP</Text>
                {quoteError && <Alert title="Erro" variant="error">{quoteError}</Alert>}
                {quoteSuccess && <Alert title="Sucesso" variant="success">{quoteSuccess}</Alert>}
                <Button
                    variant={quoteStatus?.hasQuote ? "secondary" : "primary"}
                    onClick={handleQuoteAction}
                    disabled={quoteLoading || (quoteStatus?.buttonAction === "GENERATE_PDF" && !quoteStatus.isConfirmed)}
                >
                    {quoteLoading ? "..." : (quoteStatus?.buttonLabel || "Criar Orçamento")}
                </Button>

                {quoteStatus?.isConfirmed && (
                    <Box>
                        <Divider />
                        {convertError && <Alert title="Erro Conversão" variant="error">{convertError}</Alert>}
                        {convertSuccess && <Alert title="Sucesso" variant="success">Pedido gerado!</Alert>}
                        <Button variant="primary" onClick={handleConvertToOrder} disabled={converting || hasStockIssue}>
                            {converting ? "..." : "🚀 Faturar"}
                        </Button>
                    </Box>
                )}
            </Flex>

            {/* Modal de Preço Personalizado na Raiz */}
            {
                customPriceItemId && (
                    <Modal id="modal-custom-price" title="Preço Personalizado">
                        <ModalBody>
                            <Flex direction="column" gap="md">
                                <Text>Insira o valor total desejado para este item. O preço unitário será calculado automaticamente.</Text>
                                <NumberInput
                                    label="Valor Total (Item)"
                                    name="custom-total-value"
                                    value={customPriceValue}
                                    onChange={setCustomPriceValue}
                                />
                                <Flex direction="row" gap="sm">
                                    <Button variant="primary" onClick={handleApplyCustomPrice}>Salvar e Aplicar</Button>
                                    <Button variant="secondary" onClick={() => setCustomPriceItemId(null)}>Cancelar</Button>
                                </Flex>
                            </Flex>
                        </ModalBody>
                    </Modal>
                )
            }
        </Flex >
    );
};

export default PrecosCard;